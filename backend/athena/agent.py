from strands import Agent
from dotenv import load_dotenv
import os
import json
from datetime import datetime
from pymongo import MongoClient

# Load environment variables from .env file
load_dotenv('../.env')

# Get environment variables
system_prompt = os.getenv("ATHENA_SYSTEM_PROMPT")
user_message = os.getenv("USER_MESSAGE")
session_id = os.getenv("SESSION_ID")
user_id = os.getenv("USER_ID")

if not user_message:
    print("Error: USER_MESSAGE not provided")
    exit(1)

if not session_id or not user_id:
    print("Error: SESSION_ID or USER_ID not provided")
    exit(1)

# Initialize agent
agent = Agent(system_prompt=system_prompt)

# Process user message
response = agent(user_message)
response_str = str(response)

# Remove markdown code block markers if present
if response_str.strip().startswith('```json'):
    response_str = response_str.strip()[7:]  # Remove ```json
if response_str.strip().endswith('```'):
    response_str = response_str.strip()[:-3]  # Remove ```

# Find JSON boundaries
start = response_str.find('{')
end = response_str.rfind('}') + 1

if start == -1 or end == 0:
    print("Error: No valid JSON found in agent response")
    exit(1)

json_str = response_str[start:end]
try:
    processedData = json.loads(json_str)
except json.JSONDecodeError as e:
    print(f"Error: Failed to parse JSON - {e}")
    exit(1)

# Connect to MongoDB and save to pathways collection
try:
    mongo_uri = os.getenv("MONGODB_URL")
    client = MongoClient(mongo_uri)
    db = client[os.getenv("DB_NAME")]
    
    # Delete existing pathways for this user
    db.pathways.delete_many({"user_id": user_id})
    
    # Create pathway document
    pathway_doc = {
        "user_id": user_id,
        "pathway": processedData.get('outputs', {}).get('storage', {}).get('pathway', processedData),
        "mermaid": processedData.get('outputs', {}).get('visualization', {}).get('mermaid', "")
    }
    
    # Insert into pathways collection
    result = db.pathways.insert_one(pathway_doc)
    
    if result.inserted_id:
        print("Pathway saved successfully")
        print("201")
    else:
        print("Failed to save pathway")
        print("500")
        
except Exception as e:
    print(f"Database error: {e}")
    print("500")
finally:
    if 'client' in locals():
        client.close()
