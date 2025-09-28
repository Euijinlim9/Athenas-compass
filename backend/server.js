import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import requestLogger from './logging/requestLogger.js';
import responseLogger from './logging/responseLogger.js';
import crypto from 'crypto';
dotenv.config();

const app = express();
const port = 3000;

// MongoDB connection
const mongoUrl = process.env.MONGODB_URL;
const dbName = process.env.DB_NAME;
let db;

MongoClient.connect(mongoUrl)
  .then(client => {
    console.log('Connected to MongoDB');
    db = client.db(dbName);
  })
  .catch(error => console.error('Error connecting to MongoDB:', error)); // HANDLE THIS FOR SENSITIVITY

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 100 requests per minute
  message: 'Too many requests from this IP, please try again.',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});

app.use(limiter); // Apply general rate limiting to all requests
app.use(requestLogger); // Log all api requests
app.use(cookieParser());
app.use(express.json({ limit: '1mb' })); // Limit request body size to 1MB to tame payload sizes for DoS prevention

function validateUsername(username) {
  // Allow alphanumeric, underscore, hyphen, dot (3-30 chars)
  const usernameRegex = /^[a-zA-Z0-9._-]{3,30}$/;
  return usernameRegex.test(username);
}

function validatePassword(password) {
  // Min 8 chars, at least one letter, one number, one special char
  const passwordRegex = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,128}$/;
  return passwordRegex.test(password);
}

function validateEmail(email) {
  // Simple email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);  
}

const createAccountLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 6, // limit each IP to 6 account creation attempts per minute
  message: 'Too many accounts created from this IP, please try again after 10 seconds.',
  skipSuccessfulRequests: true, // Don't count successful requests
});

// authN Workflow

// 1. User creation endpoint
// - If user tries to create invalid credentials, no access to DB
// - User creates valid credentials, server will hash user PW and store creds in server side db

app.post('/api/users/create', createAccountLimiter, async (req, res) => {
  if (!req.body) {
      const invalidResponse = {"message": "Request body is required"};
      return res.status(400).json(invalidResponse);
  }
  
  if (!req.body.username || !req.body.pw || !req.body.email) {
      const invalidResponse = {"message": "Username, email, and password are required"};
      return res.status(400).json(invalidResponse);
  }

  const allowedFields = ['username', 'pw', 'email'];
  const extraFields = Object.keys(req.body).filter(field => !allowedFields.includes(field));
  if (extraFields?.length > 0) {
      const invalidResponse = {"message": "Only username, email, and pw fields are allowed"};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  // Check for duplicate username
  const existingUser = await db.collection('users').findOne({ user_email: req.body.email });
  if (existingUser) {
      const invalidResponse = {"message": "Email already exists"};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  const user = req.body.username;
  const pw = req.body.pw;
  const email = req.body.email;

  // Validate username
  if (!validateUsername(user)) {
      const invalidResponse = {"message": "Username must be 3-30 characters, alphanumeric with ._- only"};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }
  
  // Validate email
  if (!validateEmail(req.body.email)) {
      const invalidResponse = {"message": "Invalid email format"};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  // Validate password
  if (!validatePassword(pw)) {
      const invalidResponse = {"message": "Password must be 8+ characters with letter, number, and special character [@,$,!,%,*,?,&,#] "};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  // Hash the PW and store the new user in the DB    
  try {
      // Generate salt as base64 (44 characters)
      const salt = crypto.randomBytes(32).toString('base64');
      
      // Create hash as base64 (88 characters)
      const userhash = crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha256').toString('base64');
      
      const newDate = new Date();

      const newUser = {
          username: user,
          user_email: email,
          hash: userhash,
          salt: salt,
          friends: [],
          createdAt: newDate,
          updatedAt: newDate
      };
      await db.collection('users').insertOne(newUser);
      const successResponse = {"message": "User created successfully"};
      responseLogger(201, successResponse, req);
      return res.status(201).json(successResponse);

  } catch (error) {
      const errorResponse = {"Error": "Internal server error"};
      responseLogger(500, errorResponse, req);
      return res.status(500).json(errorResponse);
  }
});

const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: 60, // limit each IP to 6 account creation attempts per minute
  message: 'Too many attempts from this IP, please try again.',
  skipSuccessfulRequests: true, // Don't count successful requests
});

// 2. User login endpoint
// - User logs in with credentials
// - If user provides no creds, no access
// - Server will hash provided PW and check provided creds against creds in DB
// - If creds don't exist in DB, no access
// - If user supplies valid credentials, server creates a session object in the DB with 
// data about the user, TTL, and generates a random value for a session id,
// - the endpoint sends the session value back to the user in the login response 
// in the form of a session_id cookie (use 'set-cookie' in the HTTP response)
app.post('/api/users/login', loginLimiter, async (req, res) => {
  if (!req.body) {
      const invalidResponse = {"message": "Request body is required"};
      return res.status(400).json(invalidResponse);
  }
  
  if (!req.body.pw || !req.body.email) {
      const invalidResponse = {"message": "Email and password are required"};
      return res.status(400).json(invalidResponse);
  }

  const allowedFields = ['pw', 'email'];
  const extraFields = Object.keys(req.body).filter(field => !allowedFields.includes(field));
  if (extraFields?.length > 0) {
      const invalidResponse = {"message": "Only email and pw fields are allowed"};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  const email = req.body.email;
  const pw = req.body.pw;


  if (!validateEmail(email)) {
      const invalidResponse = {"message": "Invalid email format"};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  // Validate password
  if (!validatePassword(pw)) {
      const invalidResponse = {"message": "Password must be 8+ characters with letter, number, and special character [@,$,!,%,*,?,&,#] "};
      responseLogger(400, invalidResponse, req);
      return res.status(400).json(invalidResponse);
  }

  try {
      // Fetch the user's salt from the DB
      const saltResult = await db.collection('users').findOne({ user_email: email }, { projection: { salt: 1, _id: 0 } });
      if (!saltResult) {
        // User not found
        const invalidResponse = {"message": "Invalid credentials"};
        responseLogger(401, invalidResponse, req);
        return res.status(401).json(invalidResponse);
      }

      const userhash = crypto.pbkdf2Sync(pw, saltResult?.salt, 100000, 64, 'sha256').toString('base64');

      // Check if a user with the provided email and hashed password exists
      const userDoc = await db.collection('users').findOne({ user_email: email, hash: userhash }, { projection: { _id: 1, username: 1 } });

      if (!userDoc) {
        // User not found
        const invalidResponse = {"message": "Invalid credentials"};
        responseLogger(401, invalidResponse, req);
        return res.status(401).json(invalidResponse);
      }

      // At this point, credentials have been validated
      const session = await db.collection('sessions').findOne({ user_id: userDoc._id});
      if (session && session?.expires_at > new Date()) {
        const successResponse = {"message": "User found! Session already established."};
        responseLogger(200, successResponse, req);
        return res.status(200).json(successResponse);
      }

      // Session data
      const sessionValue = crypto.randomBytes(32).toString('base64');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min TTL
      const newSession = {
        session_id: sessionValue,
        user_id: userDoc._id,
        expires_at: expiresAt
      };

      // If the user does not have an existing session
      // Create a session object for the user and store in the DB, include user info and session TTL, and generate and store a random session id value
      // Use set-cookie to return the session_id cookie to the user
      await db.collection('sessions').insertOne(newSession);
      // Set the session_id cookie in the response header
      res.setHeader('Set-Cookie', `session_id=${sessionValue}; HttpOnly; SameSite=Strict; Path=/; Expires=${expiresAt.toUTCString()};`); // Set Secure later, after HTTPS is enabled
      const successResponse = {"message": "User found! Session created."};
      responseLogger(201, successResponse, req);
      return res.status(201).json(successResponse);
      
  } catch (error) {
      const errorResponse = {"Error": error.message};
      responseLogger(500, errorResponse, req);
      return res.status(500).json(errorResponse);
  }
});

// 3. authN Check Middleware
// To check for authentication, authN endpoints will do a DB lookup on the session_id cookie, no cookie, no access
// If cookie is found in DB AND current time < cookie TTL, provide access to endpoint, if cookie is expired, no access
async function authN(req, res, next) {
  try {
      if (!req.cookies.session_id) {
          const invalidResponse = {"message": "Unauthorized"};
          responseLogger(401, invalidResponse, req);
          return res.status(401).json(invalidResponse);
      }
      
      const sessionValueCookie = req.cookies.session_id;
      
      // Check if the session_id cookie exists in the DB and fetch its TTL
      const expiryResult = await db.collection('sessions').findOne({ session_id: sessionValueCookie }, { projection: { expires_at: 1, _id: 0 } });
      if (!expiryResult) {
        const invalidResponse = {"message": "Unauthorized"};
        responseLogger(401, invalidResponse, req);
        return res.status(401).json(invalidResponse);
      }

      if (new Date() >= expiryResult?.expires_at) {
        const invalidResponse = {"message": "Session expired, validate credentials again"};
        responseLogger(401, invalidResponse, req);
        return res.status(401).json(invalidResponse);
      }
      next();
  }
  catch (error) {
      const errorResponse = {"Error": error.message || "Internal server error"};
      responseLogger(500, errorResponse, req);
      return res.status(500).json(errorResponse);
  }
};


// Protected endpoint
app.get('/api/users/protected', authN, (req, res) => {
  const successResponse = {"message": "Welcome to the users API!"};
  responseLogger(200, successResponse, req);
  return res.status(200).json(successResponse);
});

// Get current user info
app.get('/api/users/me', authN, async (req, res) => {
  try {
    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId }, { projection: { _id: 1, user_id: 1 } });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    const user = await db.collection('users').findOne(
      { _id: session.user_id }, 
      { projection: { username: 1, user_email: 1, _id: 0 } }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ username: user.username, user_email: user.user_email });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Search users by username
app.get('/api/users/search/:username', authN, async (req, res) => {
  try {
    const { username } = req.params;
    
    if (!username || username.length < 2) {
      return res.status(400).json({ message: "Username must be at least 2 characters" });
    }

    const users = await db.collection('users').find(
      { username: { $regex: username, $options: 'i' } },
      { projection: { username: 1, user_email: 1, score: 1, _id: 0 } }
    ).limit(10).toArray();

    res.json(users.map(user => ({ 
      username: user.username, 
      email: user.user_email,
      score: user.score || 0
    })));
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// AI Agent endpoint
app.post('/api/agent/pathway', authN, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    // Set environment variables for Python script
    process.env.USER_MESSAGE = message;
    process.env.SESSION_ID = sessionId;
    process.env.USER_ID = session.user_id.toString();

    // Execute Python agent
    const pythonProcess = spawn('./strands-env/bin/python', ['agent.py'], {
      cwd: './athena',
      env: { ...process.env, PATH: "/usr/local/opt/python@3.12/libexec/bin:" + process.env.PATH }
    });

    let output = '';
    let error = '';

    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    pythonProcess.on('close', async (code) => {
      if (code !== 0) {
        console.error('Python script error:', error);
        return res.status(500).json({ message: "Agent processing failed", error });
      }

      try {
        console.log('Python output:', output);
        console.log('Python error:', error);
        
        // Parse the agent output to get the pathway data
        const lines = output.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        
        if (lastLine === '201') {
          res.status(201).json({ message: "Pathway created successfully" });
        } else {
          res.status(500).json({ message: "Failed to save pathway", output, error });
        }
      } catch (parseError) {
        console.error('Error parsing agent output:', parseError);
        res.status(500).json({ message: "Error processing agent response" });
      }
    });

  } catch (error) {
    console.error('Agent endpoint error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get user pathways
app.get('/api/pathways', authN, async (req, res) => {
  try {
    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    const pathways = await db.collection('pathways').find({ user_id: session.user_id.toString() }).toArray();
    res.json({ pathways });
  } catch (error) {
    console.error('Get pathways error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update task status
app.patch('/api/pathways/task', authN, async (req, res) => {
  try {
    const { levelNumber, stepNumber, taskId, status } = req.body;
    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    const result = await db.collection('pathways').updateOne(
      { 
        user_id: session.user_id.toString(),
        "pathway.levels.levelNumber": levelNumber,
        "pathway.levels.steps.stepNumber": stepNumber,
        "pathway.levels.steps.tasks.id": taskId
      },
      { 
        $set: { "pathway.levels.$[level].steps.$[step].tasks.$[task].status": status }
      },
      {
        arrayFilters: [
          { "level.levelNumber": levelNumber },
          { "step.stepNumber": stepNumber },
          { "task.id": taskId }
        ]
      }
    );

    if (result.modifiedCount > 0) {
      res.json({ message: "Task status updated successfully" });
    } else {
      res.status(404).json({ message: "Task not found" });
    }
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update step status
app.patch('/api/pathways/step', authN, async (req, res) => {
  try {
    const { levelNumber, stepNumber, status } = req.body;
    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    const result = await db.collection('pathways').updateOne(
      { 
        user_id: session.user_id.toString(),
        "pathway.levels.levelNumber": levelNumber,
        "pathway.levels.steps.stepNumber": stepNumber
      },
      { 
        $set: { "pathway.levels.$[level].steps.$[step].status": status }
      },
      {
        arrayFilters: [
          { "level.levelNumber": levelNumber },
          { "step.stepNumber": stepNumber }
        ]
      }
    );

    if (result.modifiedCount > 0) {
      res.json({ message: "Step status updated successfully" });
    } else {
      res.status(404).json({ message: "Step not found" });
    }
  } catch (error) {
    console.error('Update step error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update level status
app.patch('/api/pathways/level', authN, async (req, res) => {
  try {
    const { levelNumber, status } = req.body;
    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    // Update current level to completed and next level to in-progress
    const updates = [
      {
        updateOne: {
          filter: { 
            user_id: session.user_id.toString(),
            "pathway.levels.levelNumber": levelNumber
          },
          update: { 
            $set: { "pathway.levels.$.status": "completed" }
          }
        }
      }
    ];

    // If there's a next level, set it to in-progress
    const nextLevelNumber = levelNumber + 1;
    updates.push({
      updateOne: {
        filter: { 
          user_id: session.user_id.toString(),
          "pathway.levels.levelNumber": nextLevelNumber
        },
        update: { 
          $set: { "pathway.levels.$.status": "in-progress" }
        }
      }
    });

    await db.collection('pathways').bulkWrite(updates);
    res.json({ message: "Level status updated successfully" });
  } catch (error) {
    console.error('Update level error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update user score
app.patch('/api/user/score', authN, async (req, res) => {
  try {
    const { score } = req.body;
    const sessionId = req.cookies.session_id;
    const session = await db.collection('sessions').findOne({ session_id: sessionId });
    
    if (!session) {
      return res.status(401).json({ message: "Session not found" });
    }

    const user = await db.collection('users').findOne({ _id: session.user_id });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const result = await db.collection('users').updateOne(
      { email: user.email },
      { $set: { score: score } }
    );

    if (result.modifiedCount > 0) {
      res.json({ message: "Score updated successfully" });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error('Update score error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Send friend request
app.post('/friend-request', authN, async (req, res) => {
  try {
    const { senderUsername, senderEmail, receiverUsername, receiverEmail } = req.body;
    
    // Check if friend request already exists
    const existingUser = await db.collection('users').findOne({
      username: receiverUsername,
      user_email: receiverEmail,
      'friends.username': senderUsername,
      'friends.user_email': senderEmail
    });

    if (existingUser) {
      return res.status(400).json({ error: "Friend request already exists" });
    }
    
    await db.collection('users').updateOne(
      { username: receiverUsername, user_email: receiverEmail },
      { 
        $push: { 
          friends: { 
            username: senderUsername, 
            email: senderEmail, 
            accepted: false,
            timestamp: new Date()
          } 
        },
        $set: { updatedAt: new Date() }
      }
    );

    triggerWebhook(receiverUsername, receiverEmail);
    responseLogger(200, { success: true, message: 'Friend request sent' }, req);
    return res.status(200).json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    responseLogger(500, { error: "Internal server error" }, req);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Accept friend request
app.post('/accept-friend', authN, async (req, res) => {
  try {
    const { accepterUsername, accepterEmail, requesterUsername, requesterEmail } = req.body;
    
    await db.collection('users').updateOne(
      { 
        username: accepterUsername, 
        user_email: accepterEmail,
        'friends.username': requesterUsername,
        'friends.user_email': requesterEmail
      },
      { 
        $set: { 
          'friends.$.accepted': true,
          updatedAt: new Date()
        } 
      }
    );

    await db.collection('users').updateOne(
      { username: requesterUsername, user_email: requesterEmail },
      { 
        $push: { 
          friends: { 
            username: accepterUsername, 
            user_email: accepterEmail, 
            accepted: true,
            timestamp: new Date()
          } 
        },
        $set: { updatedAt: new Date() }
      }
    );

    triggerWebhook(accepterUsername, accepterEmail);
    triggerWebhook(requesterUsername, requesterEmail);
    responseLogger(200, { success: true, message: 'Friend request accepted' }, req);
    return res.status(200).json({ success: true, message: 'Friend request accepted' });
  } catch (error) {
    responseLogger(500, { error: "Internal server error" }, req);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Get friends list
app.get('/friends/:username/:email',authN, async (req, res) => {
  try {
    const { username, email } = req.params;
    const user = await db.collection('users').findOne({ username, user_email: email }, { projection: { friends: 1, _id: 0 } });
    
    // Get scores for each friend
    const friendsWithScores = await Promise.all(
      (user?.friends || []).map(async (friend) => {
        const friendUser = await db.collection('users').findOne(
          { user_email: friend.email },
          { projection: { score: 1, _id: 0 } }
        );
        return {
          ...friend,
          score: friendUser?.score || 0
        };
      })
    );
    
    responseLogger(200, { friends: friendsWithScores }, req);
    return res.status(200).json({ friends: friendsWithScores });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


async function triggerWebhook(username, email) {
  try {
    const user = await db.collection('users').findOne({ username, user_email: email }, { projection: { friends: 1, _id: 0 } });
    const friendsData = user?.friends || [];
    
    // Send via WebSocket to connected client
    const key = `${username}:${email}`;
    const client = clients.get(key);
    
    if (client && client.readyState === client.OPEN) {
      client.send(JSON.stringify({
        type: 'friends_update',
        friendsData
      }));
      console.log(`WebSocket update sent to ${username}`);
    }
  } catch (error) {
    console.log('WebSocket trigger error:', error.message);
  }
}

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// WebSocket server on same port as HTTP server
const wss = new WebSocketServer({ server });
const clients = new Map();

console.log('WebSocket server running on same port as HTTP server');

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'register') {
      const key = `${data.username}:${data.email}`;
      clients.set(key, ws);
      console.log(`WebSocket client registered: ${key}`);
    }
  });

  ws.on('close', () => {
    for (const [key, client] of clients.entries()) {
      if (client === ws) {
        clients.delete(key);
        console.log(`WebSocket client disconnected: ${key}`);
        break;
      }
    }
  });
});

// Serve frontend static files
const __dirname = path.dirname(new URL(import.meta.url).pathname);
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all handler for frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});
