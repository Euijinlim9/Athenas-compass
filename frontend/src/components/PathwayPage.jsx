import { useEffect, useRef, useState } from 'react'
import { Card, Progress, Button, Typography, Row, Col, Space, Input, Modal, message, Checkbox, List } from 'antd'
import { RocketOutlined, SaveOutlined, PlayCircleOutlined } from '@ant-design/icons'
import mermaid from 'mermaid'

const { Title, Paragraph } = Typography

function PathwayPage() {
  const mermaidRef = useRef(null)
  const [pathways, setPathways] = useState([])
  const [currentPathway, setCurrentPathway] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedLevel, setSelectedLevel] = useState(null)
  const [experience, setExperience] = useState('')
  const [desiredRole, setDesiredRole] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchPathways()
  }, [])

  const fetchPathways = async () => {
    try {
      const response = await fetch('/api/pathways', {
        credentials: 'include'
      })
      const data = await response.json()
      
      if (response.ok) {
        setPathways(data.pathways)
        if (data.pathways.length > 0) {
          setCurrentPathway(data.pathways[0]) // Use the first pathway
        }
      } else {
        message.error('Failed to fetch pathways')
      }
    } catch (error) {
      console.error('Error fetching pathways:', error)
      message.error('Error loading pathways')
    }
  }

  const parseMermaidFromLLM = (llmOutput) => {
    return llmOutput.replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
  }

  const calculateProgress = () => {
    const currentLevel = getCurrentLevel()
    if (!currentLevel) return 0
    
    const totalTasks = currentLevel.steps?.reduce((total, step) => total + (step.tasks?.length || 0), 0) || 0
    const completedTasks = currentLevel.steps?.reduce((total, step) => 
      total + (step.tasks?.filter(task => task.status === 'completed').length || 0), 0) || 0
    
    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  }

  const updateTaskStatus = async (levelNumber, stepNumber, taskId, status) => {
    try {
      const response = await fetch('/api/pathways/task', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          levelNumber,
          stepNumber,
          taskId,
          status: status ? 'completed' : 'not-started'
        })
      })

      if (response.ok) {
        message.success('Task updated successfully')
        await fetchPathways() // Refresh pathways
        await updateUserScore()
        
        // Check if all tasks in the level are completed
        setTimeout(() => {
          checkAllTasksInLevel(levelNumber)
        }, 1000)
      } else {
        message.error('Failed to update task')
      }
    } catch (error) {
      console.error('Error updating task:', error)
      message.error('Error updating task')
    }
  }

  const checkAllTasksInLevel = async (levelNumber) => {
    const level = currentPathway.pathway?.levels?.find(l => l.levelNumber === levelNumber)
    if (!level) return

    const allTasks = level.steps?.flatMap(step => step.tasks || []) || []
    const allTasksCompleted = allTasks.every(task => task.status === 'completed')
    
    if (allTasksCompleted && level.status !== 'completed') {
      // Mark all steps as completed first
      for (const step of level.steps || []) {
        if (step.status !== 'completed') {
          await updateStepStatus(levelNumber, step.stepNumber, 'completed')
        }
      }
      
      // Then mark level as completed
      await updateLevelStatus(levelNumber, 'completed')
    }
  }

  const checkStepCompletion = async (levelNumber, stepNumber) => {
    const currentLevel = getCurrentLevel()
    if (!currentLevel) return

    const step = currentLevel.steps?.find(s => s.stepNumber === stepNumber)
    if (!step) return

    const allTasksCompleted = step.tasks?.every(task => task.status === 'completed')
    
    if (allTasksCompleted && step.status !== 'completed') {
      await updateStepStatus(levelNumber, stepNumber, 'completed')
      
      // Check if all steps in level are completed
      setTimeout(() => {
        checkLevelCompletion(levelNumber)
      }, 1000)
    }
  }

  const checkLevelCompletion = async (levelNumber) => {
    await fetchPathways() // Refresh data first
    
    const refreshedPathway = pathways.find(p => p._id === currentPathway._id)
    const level = refreshedPathway?.pathway?.levels?.find(l => l.levelNumber === levelNumber)
    
    if (!level) return

    const allStepsCompleted = level.steps?.every(step => step.status === 'completed')
    
    if (allStepsCompleted && level.status !== 'completed') {
      await updateLevelStatus(levelNumber, 'completed')
      await updateUserScore()
    }
  }

  const updateUserScore = async () => {
    try {
      const totalCompletedTasks = currentPathway?.pathway?.levels?.reduce((total, level) => 
        total + (level.steps?.reduce((stepTotal, step) => 
          stepTotal + (step.tasks?.filter(task => task.status === 'completed').length || 0), 0) || 0), 0) || 0

      await fetch('/api/user/score', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ score: totalCompletedTasks })
      })
    } catch (error) {
      console.error('Error updating score:', error)
    }
  }

  const updateStepStatus = async (levelNumber, stepNumber, status) => {
    try {
      const response = await fetch('/api/pathways/step', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          levelNumber,
          stepNumber,
          status
        })
      })

      if (response.ok) {
        await fetchPathways()
      }
    } catch (error) {
      console.error('Error updating step:', error)
    }
  }

  const updateLevelStatus = async (levelNumber, status) => {
    try {
      const response = await fetch('/api/pathways/level', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          levelNumber,
          status
        })
      })

      if (response.ok) {
        message.success('Level completed! Next level unlocked.')
        await fetchPathways() // Force refresh
        // Force component re-render by updating state
        setCurrentPathway(null)
        setTimeout(async () => {
          const refreshedPathways = await fetch('/api/pathways', { credentials: 'include' }).then(r => r.json())
          if (refreshedPathways.pathways.length > 0) {
            setCurrentPathway(refreshedPathways.pathways[0])
          }
        }, 100)
      }
    } catch (error) {
      console.error('Error updating level:', error)
    }
  }

  const getCurrentLevel = () => {
    if (!currentPathway?.pathway?.levels) return null
    
    // First try to find in-progress level
    const inProgressLevel = currentPathway.pathway.levels.find(level => level.status === 'in-progress')
    if (inProgressLevel) return inProgressLevel
    
    // Then find first not-started level
    const notStartedLevel = currentPathway.pathway.levels.find(level => level.status === 'not-started')
    if (notStartedLevel) return notStartedLevel
    
    // Fallback to first level
    return currentPathway.pathway.levels[0]
  }

  useEffect(() => {
    mermaid.initialize({ 
      startOnLoad: false,
      theme: 'default',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true
      }
    })
    
    const renderDiagram = async () => {
      if (mermaidRef.current && currentPathway?.mermaid) {
        try {
          const parsedMermaid = parseMermaidFromLLM(currentPathway.mermaid)
          const { svg } = await mermaid.render('mermaid-diagram', parsedMermaid)
          mermaidRef.current.innerHTML = svg
          
          // Add click listeners to nodes
          setTimeout(() => {
            const nodes = mermaidRef.current.querySelectorAll('g.node')
            console.log('Found nodes:', nodes.length)
            nodes.forEach((node, index) => {
              node.style.cursor = 'pointer'
              node.addEventListener('click', (e) => {
                e.preventDefault()
                console.log('Node clicked, index:', index)
                
                // Skip first node (start node) and map to correct level
                if (index === 0) {
                  console.log('Start node clicked, ignoring')
                  return
                }
                
                const levelIndex = index - 1 // Adjust for start node
                const level = currentPathway.pathway?.levels?.[levelIndex]
                if (level) {
                  console.log('Setting selected level:', level)
                  setSelectedLevel(level)
                } else {
                  console.log('No level found at adjusted index:', levelIndex)
                }
              })
            })
          }, 500)
        } catch (error) {
          console.error('Mermaid rendering error:', error)
          mermaidRef.current.innerHTML = '<p>Error loading diagram</p>'
        }
      }
    }
    
    if (currentPathway) {
      renderDiagram()
    }
  }, [currentPathway])

  const generatePathway = async () => {
    if (!experience.trim() || !desiredRole.trim()) {
      message.error('Please fill in both fields')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/agent/pathway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          message: `Current experience: ${experience}. Desired role: ${desiredRole}. Please create a career pathway.`
        })
      })

      const data = await response.json()
      
      if (response.ok) {
        message.success('Pathway generated successfully!')
        setShowModal(false)
        setExperience('')
        setDesiredRole('')
        // Refresh pathways
        await fetchPathways()
      } else {
        message.error(data.message || 'Failed to generate pathway')
      }
    } catch (error) {
      console.error('Error generating pathway:', error)
      message.error('Error generating pathway')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header Section */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Title level={1} style={{ color: '#1890ff', marginBottom: '8px' }}>
            <RocketOutlined /> Your Career Pathway
          </Title>
          <Paragraph style={{ fontSize: '18px', color: '#666' }}>
            Visualize your journey and track your progress towards your dream career
          </Paragraph>
          {currentPathway && (
            <div style={{ marginTop: '16px' }}>
              <Paragraph style={{ fontSize: '16px', fontWeight: 'bold', color: '#52c41a' }}>
                Score: {currentPathway?.pathway?.levels?.reduce((total, level) => 
                  total + (level.steps?.reduce((stepTotal, step) => 
                    stepTotal + (step.tasks?.filter(task => task.status === 'completed').length || 0), 0) || 0), 0) || 0} completed tasks
              </Paragraph>
            </div>
          )}
        </div>

        {/* Questionnaire Section */}
        <Card style={{ marginBottom: '24px' }}>
          <Title level={4} style={{ marginBottom: '24px' }}>Tell Us About Your Journey</Title>
          
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <label style={{ fontWeight: 'bold', color: '#333', fontSize: '16px' }}>
                  What experience do you currently have?
                </label>
                <Input.TextArea
                  placeholder="Describe your current skills, education, or work experience..."
                  rows={4}
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  style={{ fontSize: '14px' }}
                />
              </Space>
            </Col>
            
            <Col xs={24} md={12}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <label style={{ fontWeight: 'bold', color: '#333', fontSize: '16px' }}>
                  What role do you want to achieve?
                </label>
                <Input.TextArea
                  placeholder="Describe your dream job or career goal..."
                  rows={4}
                  value={desiredRole}
                  onChange={(e) => setDesiredRole(e.target.value)}
                  style={{ fontSize: '14px' }}
                />
              </Space>
            </Col>
          </Row>

          <div style={{ textAlign: 'center', marginTop: '24px' }}>
            <Button 
              type="primary" 
              size="large"
              icon={<RocketOutlined />}
              onClick={() => setShowModal(true)}
              style={{ height: '50px', fontSize: '16px', padding: '0 32px' }}
            >
              Generate My Pathway
            </Button>
          </div>
        </Card>

        <Modal
          title="Generate New Pathway"
          open={showModal}
          onOk={generatePathway}
          onCancel={() => setShowModal(false)}
          okText="Yes, Generate Pathway"
          cancelText="Cancel"
          confirmLoading={loading}
        >
          <p>Creating a new pathway will delete your existing pathway. Are you sure you want to continue?</p>
        </Modal>

        {/* Selected Level Steps Display */}
        {console.log('selectedLevel state:', selectedLevel)}
        {selectedLevel && (
          <Card 
            title={`Level ${selectedLevel.levelNumber}: ${selectedLevel.title} (${selectedLevel.duration})`}
            style={{ marginBottom: '24px', border: '2px solid #1890ff' }}
            extra={
              <div style={{ textAlign: 'right' }}>
                <Button onClick={() => setSelectedLevel(null)}>Close</Button>
              </div>
            }
          >
            {selectedLevel.steps?.map((step, stepIndex) => (
              <Card 
                key={stepIndex}
                type="inner" 
                title={`Step ${step.stepNumber}: ${step.title}`}
                style={{ marginBottom: '16px' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  {step.tasks?.map((task, taskIndex) => {
                    const canEdit = selectedLevel.levelNumber === 1 || 
                      currentPathway.pathway?.levels?.find(l => l.levelNumber === selectedLevel.levelNumber - 1)?.status === 'completed'
                    
                    return (
                      <Checkbox 
                        key={taskIndex}
                        checked={task.status === 'completed'}
                        disabled={!canEdit || task.status === 'completed'}
                        onChange={(e) => {
                          if (e.target.checked && canEdit) {
                            updateTaskStatus(
                              selectedLevel.levelNumber,
                              step.stepNumber,
                              task.id,
                              true
                            )
                          }
                        }}
                      >
                        {task.title}
                      </Checkbox>
                    )
                  })}
                </Space>
              </Card>
            ))}
          </Card>
        )}

        {/* Pathway Visualization */}
        {currentPathway && (
          <Card 
            title={
              <Space>
                <RocketOutlined />
                <span>Your Career Pathway</span>
              </Space>
            }
            style={{ marginBottom: '24px' }}
          >
            <div style={{ 
              overflow: 'auto', 
              padding: '20px',
              backgroundColor: '#fafafa',
              borderRadius: '8px',
              border: '1px solid #f0f0f0',
              textAlign: 'center'
            }}>
              <div ref={mermaidRef} style={{ minHeight: '400px', minWidth: '800px' }}></div>
              <Title level={4} style={{ marginTop: '16px', color: '#1890ff' }}>
                {currentPathway?.pathway?.title}
              </Title>
            </div>
          </Card>
        )}

        {/* No pathways message */}
        {pathways.length === 0 && (
          <Card style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Title level={4}>No Pathways Yet</Title>
            <Paragraph>Generate your first career pathway using the form above!</Paragraph>
          </Card>
        )}

        {/* Action Buttons */}
        <div style={{ textAlign: 'center' }}>
          <Space size="large">
            <Button 
              size="large" 
              icon={<SaveOutlined />}
              style={{ height: '50px', fontSize: '16px', padding: '0 32px' }}
              onClick={fetchPathways}
            >
              Refresh Pathways
            </Button>
          </Space>
        </div>
      </div>
    </div>
  )
}

export default PathwayPage
