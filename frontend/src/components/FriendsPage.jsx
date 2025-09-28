import { useState, useEffect } from 'react'
import { Card, Input, Button, List, Avatar, Badge, Typography, Row, Col, Space } from 'antd'
import { SearchOutlined, UserAddOutlined, CheckOutlined, UserOutlined } from '@ant-design/icons'

const { Title, Text } = Typography
const { Search } = Input

function FriendsPage({ user }) {
  const [friends, setFriends] = useState([])
  const [searchResults, setSearchResults] = useState([])
  const [ws, setWs] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      fetchFriends()
      
      const websocket = new WebSocket('ws://localhost:3000')
      
      websocket.onopen = () => {
        websocket.send(JSON.stringify({
          type: 'register',
          username: user.username,
          email: user.user_email
        }))
      }

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'friends_update') {
          setFriends(data.friendsData)
        }
      }

      setWs(websocket)

      return () => {
        websocket.close()
      }
    }
  }, [user])

  const fetchFriends = async () => {
    if (!user) return
    
    try {
      const response = await fetch(`/friends/${user.username}/${user.user_email}`, {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setFriends(data.friends || [])
      }
    } catch (error) {
      console.error('Error fetching friends:', error)
    }
  }

  const searchUsers = async (value) => {
    if (!value.trim() || value.length < 2) {
      setSearchResults([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/users/search/${encodeURIComponent(value)}`, {
        credentials: 'include'
      })
      
      if (response.ok) {
        const users = await response.json()
        // Filter out current user from results
        const filteredUsers = users.filter(u => u.username !== user.username)
        setSearchResults(filteredUsers)
      } else {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error searching users:', error)
      setSearchResults([])
    } finally {
      setLoading(false)
    }
  }

  const sendFriendRequest = async (receiverUsername, receiverEmail) => {
    if (!user) return

    try {
      console.log('Sending friend request to:', receiverUsername, receiverEmail, "from:", user.username, user.user_email)
      const response = await fetch('/friend-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          senderUsername: user.username,
          senderEmail: user.user_email,
          receiverUsername,
          receiverEmail
        })
      })

      if (response.ok) {
        setSearchResults([])
      }
    } catch (error) {
      console.error('Error sending friend request:', error)
    }
  }

  const acceptFriendRequest = async (requesterUsername, requesterEmail) => {
    if (!user) return

    try {
      const response = await fetch('/accept-friend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          accepterUsername: user.username,
          accepterEmail: user.user_email,
          requesterUsername,
          requesterEmail
        })
      })
    } catch (error) {
      console.error('Error accepting friend request:', error)
    }
  }

  const pendingRequests = friends.filter(friend => !friend.accepted)
  const acceptedFriends = friends.filter(friend => friend.accepted)

  return (
    <div style={{ padding: '24px', backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <Title level={2} style={{ textAlign: 'center', marginBottom: '32px' }}>
          Friends & Connections
        </Title>

        {/* Search Section */}
        <Card style={{ marginBottom: '24px' }}>
          <Title level={4}>Find New Connections</Title>
          <Search
            placeholder="Search by username (min 2 characters)..."
            enterButton={<SearchOutlined />}
            size="large"
            onSearch={searchUsers}
            loading={loading}
            style={{ marginBottom: '16px' }}
          />

          {searchResults.length > 0 && (
            <List
              header={<Text strong>Search Results</Text>}
              dataSource={searchResults}
              renderItem={(result) => (
                <List.Item
                  actions={[
                    <Button
                      type="primary"
                      icon={<UserAddOutlined />}
                      onClick={() => sendFriendRequest(result.username, result.email)}
                    >
                      Send Request
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar icon={<UserOutlined />} />}
                    title={result.username}
                    description={result.email}
                  />
                </List.Item>
              )}
            />
          )}
        </Card>

        <Row gutter={[24, 24]}>
          {/* Pending Requests */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space style={{ minHeight: '60px'}}>
                  <Badge count={pendingRequests.length} showZero>
                    <Title level={4} style={{ margin: 0 }}>Pending Requests</Title>
                  </Badge>
                </Space>
              }
              style={{ minHeight: '400px' }}
            >
              {pendingRequests.length > 0 ? (
                <List
                  dataSource={pendingRequests}
                  renderItem={(request) => (
                    <List.Item
                      actions={[
                        <Button
                          type="primary"
                          icon={<CheckOutlined />}
                          onClick={() => acceptFriendRequest(request.username, request.email)}
                        >
                          Accept
                        </Button>
                      ]}
                    >
                      <List.Item.Meta
                        avatar={<Avatar style={{ backgroundColor: '#faad14' }}>{request.username.charAt(0).toUpperCase()}</Avatar>}
                        title={request.username}
                        description={
                          <div>
                            <div>{request.email}</div>
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              {new Date(request.timestamp).toLocaleDateString()}
                            </Text>
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  No pending requests
                </div>
              )}
            </Card>
          </Col>

          {/* Friends List */}
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space style={{ minHeight: '60px'}}>
                  <Badge count={acceptedFriends.length} showZero>
                    <Title level={4} style={{ margin: 0 }}>Your Friends</Title>
                  </Badge>
                </Space>
              }
              style={{ minHeight: '400px' }}
            >
              {acceptedFriends.length > 0 ? (
                <List
                  dataSource={acceptedFriends}
                  renderItem={(friend) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<Avatar style={{ backgroundColor: '#52c41a' }}>{friend.username.charAt(0).toUpperCase()}</Avatar>}
                        title={friend.username}
                        description={friend.email}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  No friends yet. Start by searching for people to connect with!
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </div>
    </div>
  )
}

export default FriendsPage
