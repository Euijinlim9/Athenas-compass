import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Typography, Alert, Tabs, Row, Col } from 'antd'
import { UserOutlined, MailOutlined, LockOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

function AuthPage({ setUser, setIsAuthenticated }) {
  const [activeTab, setActiveTab] = useState('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (values) => {
    setLoading(true)
    setError('')

    try {
      const endpoint = activeTab === 'login' ? '/api/users/login' : '/api/users/create'
      const body = activeTab === 'login' 
        ? { email: values.email, pw: values.pw }
        : values

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body)
      })

      const data = await response.json()

      if (response.ok) {
        if (activeTab === 'login') {
          // Fetch user info after successful login
          const userResponse = await fetch('/api/users/me', {
            credentials: 'include'
          });
          
          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUser(userData);
          }
          
          setIsAuthenticated(true)
          navigate('/pathway')
        } else {
          setActiveTab('login')
          setError('Account created successfully! Please log in.')
        }
      } else {
        setError(data.message || 'An error occurred')
      }
    } catch (error) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const tabItems = [
    {
      key: 'login',
      label: 'Sign In',
      children: (
        <Form
          name="login"
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' }
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="Email address" />
          </Form.Item>

          <Form.Item
            name="pw"
            label="Password"
            rules={[{ required: true, message: 'Please input your password!' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Sign In
            </Button>
          </Form.Item>
        </Form>
      )
    },
    {
      key: 'signup',
      label: 'Sign Up',
      children: (
        <Form
          name="signup"
          onFinish={handleSubmit}
          layout="vertical"
          size="large"
        >
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Please input your username!' },
              { min: 3, message: 'Username must be at least 3 characters!' }
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Please input your email!' },
              { type: 'email', message: 'Please enter a valid email!' }
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="Email address" />
          </Form.Item>

          <Form.Item
            name="pw"
            label="Password"
            rules={[
              { required: true, message: 'Please input your password!' },
              { min: 8, message: 'Password must be at least 8 characters!' }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              Create Account
            </Button>
          </Form.Item>
        </Form>
      )
    }
  ]

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <Row justify="center" style={{ width: '100%' }}>
        <Col xs={22} sm={16} md={12} lg={8} xl={6}>
          <Card
            style={{
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              borderRadius: '12px'
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <Title level={2} style={{ color: '#1890ff', marginBottom: '8px' }}>
                CareerPath
              </Title>
              <Text type="secondary">
                {activeTab === 'login' ? 'Welcome back!' : 'Start your journey today'}
              </Text>
            </div>

            {error && (
              <Alert
                message={error}
                type={error.includes('successfully') ? 'success' : 'error'}
                showIcon
                style={{ marginBottom: '16px' }}
              />
            )}

            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              items={tabItems}
              centered
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default AuthPage
