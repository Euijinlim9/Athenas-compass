import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { useState, useEffect } from 'react'
import HomePage from './components/HomePage'
import AuthPage from './components/AuthPage'
import PathwayPage from './components/PathwayPage'
import FriendsPage from './components/FriendsPage'
import Navbar from './components/Navbar'

function App() {
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/users/protected', {
        credentials: 'include'
      })
      if (response.ok) {
        setIsAuthenticated(true)
        
        // Get user info
        const userResponse = await fetch('/api/users/me', {
          credentials: 'include'
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData)
        }
      }
    } catch (error) {
      console.log('Not authenticated')
    }
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navbar isAuthenticated={isAuthenticated} setIsAuthenticated={setIsAuthenticated} />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route 
            path="/auth" 
            element={
              <AuthPage 
                setUser={setUser} 
                setIsAuthenticated={setIsAuthenticated} 
              />
            } 
          />
          <Route 
            path="/pathway" 
            element={
              isAuthenticated ? <PathwayPage /> : <AuthPage setUser={setUser} setIsAuthenticated={setIsAuthenticated} />
            } 
          />
          <Route 
            path="/friends" 
            element={
              isAuthenticated ? <FriendsPage user={user} /> : <AuthPage setUser={setUser} setIsAuthenticated={setIsAuthenticated} />
            } 
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
