import { Link, useNavigate } from 'react-router-dom'
import { Layout, Button, Space } from 'antd'
import { RocketOutlined, TeamOutlined } from '@ant-design/icons'

const { Header } = Layout

function Navbar({ isAuthenticated, setIsAuthenticated }) {
  const navigate = useNavigate()

  const handleLogout = () => {
    document.cookie = 'session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    setIsAuthenticated(false)
    navigate('/')
  }

  return (
    <Header style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      backgroundColor: 'white',
      borderBottom: '1px solid #f0f0f0',
      padding: '0 24px'
    }}>
      <Link to="/" style={{ 
        fontSize: '24px', 
        fontWeight: 'bold', 
        color: '#1890ff',
        textDecoration: 'none'
      }}>
        CareerPath
      </Link>
      
      <Space size="large">
        {isAuthenticated && (
          <>
            <Link to="/pathway">
              <Button type="text" icon={<RocketOutlined />}>
                My Pathway
              </Button>
            </Link>
            <Link to="/friends">
              <Button type="text" icon={<TeamOutlined />}>
                Friends
              </Button>
            </Link>
          </>
        )}
        
        {isAuthenticated ? (
          <Button onClick={handleLogout}>
            Logout
          </Button>
        ) : (
          <Link to="/auth">
            <Button type="primary">
              Sign in
            </Button>
          </Link>
        )}
      </Space>
    </Header>
  )
}

export default Navbar
