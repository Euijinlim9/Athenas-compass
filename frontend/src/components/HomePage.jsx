import { Link } from 'react-router-dom'
import { Button, Row, Col, Card, Typography } from 'antd'
import { RocketOutlined, TeamOutlined, TrophyOutlined } from '@ant-design/icons'

const { Title, Paragraph } = Typography

function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <div className="hero-section">
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
          <Title level={1} style={{ color: 'white', fontSize: '3.5rem', marginBottom: '1rem' }}>
            Your Career Journey Starts Here
          </Title>
          <Paragraph style={{ color: 'white', fontSize: '1.25rem', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
            Get personalized career pathways for software engineering, cybersecurity, and more. 
            Connect with peers, track your progress, and achieve your professional goals.
          </Paragraph>
          <Link to="/auth">
            <Button type="primary" size="large" style={{ height: '50px', fontSize: '18px', padding: '0 40px' }}>
              Start Your Journey
            </Button>
          </Link>
        </div>
      </div>

      {/* Features Section */}
      <div style={{ padding: '80px 24px', backgroundColor: '#f5f5f5' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Title level={2} style={{ textAlign: 'center', marginBottom: '3rem' }}>
            Why Choose Our Platform?
          </Title>
          <Row gutter={[32, 32]}>
            <Col xs={24} md={8}>
              <Card className="feature-card" style={{ height: '100%' }}>
                <RocketOutlined style={{ fontSize: '3rem', color: '#1890ff', marginBottom: '1rem' }} />
                <Title level={3}>Personalized Pathways</Title>
                <Paragraph>
                  Get custom learning paths tailored to your career goals and current skill level.
                </Paragraph>
              </Card>
            </Col>
            
            <Col xs={24} md={8}>
              <Card className="feature-card" style={{ height: '100%' }}>
                <TeamOutlined style={{ fontSize: '3rem', color: '#1890ff', marginBottom: '1rem' }} />
                <Title level={3}>Connect with Peers</Title>
                <Paragraph>
                  Build your network by connecting with other students and professionals in your field.
                </Paragraph>
              </Card>
            </Col>
            
            <Col xs={24} md={8}>
              <Card className="feature-card" style={{ height: '100%' }}>
                <TrophyOutlined style={{ fontSize: '3rem', color: '#1890ff', marginBottom: '1rem' }} />
                <Title level={3}>Track Progress</Title>
                <Paragraph>
                  Monitor your learning journey with visual progress tracking and milestone achievements.
                </Paragraph>
              </Card>
            </Col>
          </Row>
        </div>
      </div>

      {/* CTA Section */}
      <div style={{ padding: '80px 24px', backgroundColor: '#001529', textAlign: 'center' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <Title level={2} style={{ color: 'white', marginBottom: '1rem' }}>
            Ready to Transform Your Career?
          </Title>
          <Paragraph style={{ color: '#ccc', fontSize: '1.1rem', marginBottom: '2rem' }}>
            Join thousands of students and professionals who are already on their path to success.
          </Paragraph>
          <Link to="/auth">
            <Button type="primary" size="large" style={{ height: '50px', fontSize: '18px', padding: '0 40px' }}>
              Get Started Free
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default HomePage
