from fastapi import FastAPI, APIRouter, WebSocket, HTTPException
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import json
import base64
import asyncio
from emergentintegrations.llm.chat import LlmChat, UserMessage
from elevenlabs import ElevenLabs
import io


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="DARK AI Backend")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Initialize AI Chat
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')

# ElevenLabs client (will be initialized when user provides key)
eleven_client = None

# Define Models
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    message: str
    sender: str  # "user" or "ai"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    has_audio: bool = False
    audio_url: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    session_id: str = "main_session"

class ChatResponse(BaseModel):
    message: str
    has_audio: bool = False
    audio_url: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None

class ScreenShareSignal(BaseModel):
    type: str  # "offer", "answer", "ice-candidate"
    session_id: str
    data: dict

# Store active WebSocket connections
websocket_connections = []

def get_dark_ai_response(user_message: str) -> str:
    """Handle DARK AI specific responses and identity questions"""
    import unicodedata
    
    # Normalize unicode characters
    user_msg = unicodedata.normalize('NFKD', user_message).lower()
    
    # Turkish identity responses
    if any(phrase in user_msg for phrase in ["kim yapti", "seni kim", "kim tarafindan"]):
        return "Azad Mehtiyev ve Emergent tarafından tasarlandım."
    
    if any(phrase in user_msg for phrase in ["ismin ne", "adin ne", "kim sin", "sen kimsin", "adi ne"]):
        return "Ben DARK AI'yım."
    
    # English identity responses (backup)
    if "who made you" in user_msg or "who created you" in user_msg:
        return "Azad Mehtiyev ve Emergent tarafından tasarlandım."
    
    if "what is your name" in user_msg or "what's your name" in user_msg:
        return "Ben DARK AI'yım."
    
    return None

@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    """Main chat endpoint for DARK AI"""
    try:
        # Save user message to database
        user_message = ChatMessage(
            message=request.message,
            sender="user",
            has_audio=False
        )
        await db.chat_messages.insert_one(user_message.dict())
        
        # Check for identity responses first
        identity_response = get_dark_ai_response(request.message)
        if identity_response:
            ai_response_text = identity_response
        else:
            # Use LLM for regular conversation
            if not EMERGENT_LLM_KEY:
                raise HTTPException(status_code=500, detail="LLM key not configured")
            
            # Initialize LLM chat
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=request.session_id,
                system_message="Sen DARK AI'sın. Azad Mehtiyev ve Emergent tarafından tasarlandın. Türkçe konuş ve kullanıcıyla doğal bir sohbet et. Kalın erkek ses tonu ile cevap vermeye odaklan."
            ).with_model("openai", "gpt-4o-mini")
            
            user_msg = UserMessage(text=request.message)
            ai_response_text = await chat.send_message(user_msg)
        
        # Save AI response to database
        ai_message = ChatMessage(
            message=ai_response_text,
            sender="ai",
            has_audio=False  # Will be updated when TTS is generated
        )
        ai_message_dict = ai_message.dict()
        await db.chat_messages.insert_one(ai_message_dict)
        
        return ChatResponse(
            message=ai_response_text,
            has_audio=False
        )
        
    except Exception as e:
        logging.error(f"Error in chat: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")

@api_router.post("/tts")
async def generate_tts(request: TTSRequest):
    """Generate Turkish TTS audio"""
    try:
        if not eleven_client:
            raise HTTPException(status_code=400, detail="ElevenLabs API key not configured. Please provide API key first.")
        
        # Use a Turkish male voice (you can change this voice_id to a preferred Turkish male voice)
        voice_id = request.voice_id or "21m00Tcm4TlvBVlC8paTOq"  # Default ElevenLabs voice
        
        # Generate audio
        audio = eleven_client.generate(
            text=request.text,
            voice=voice_id,
            model="eleven_multilingual_v2"
        )
        
        # Convert to base64
        audio_bytes = b"".join(audio)
        audio_b64 = base64.b64encode(audio_bytes).decode()
        
        return {
            "audio_url": f"data:audio/mpeg;base64,{audio_b64}",
            "text": request.text
        }
        
    except Exception as e:
        logging.error(f"Error generating TTS: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS error: {str(e)}")

@api_router.get("/chat/history")
async def get_chat_history(session_id: str = "main_session"):
    """Get chat history"""
    try:
        messages = await db.chat_messages.find().sort("timestamp", -1).limit(50).to_list(50)
        return [ChatMessage(**msg) for msg in messages]
    except Exception as e:
        logging.error(f"Error getting chat history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"History error: {str(e)}")

@api_router.post("/config/elevenlabs")
async def configure_elevenlabs(api_key: str):
    """Configure ElevenLabs API key"""
    global eleven_client
    try:
        eleven_client = ElevenLabs(api_key=api_key)
        return {"message": "ElevenLabs configured successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid ElevenLabs API key: {str(e)}")

# WebSocket for screen sharing signaling
@app.websocket("/ws/screen-share/{session_id}")
async def screen_share_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    websocket_connections.append({"websocket": websocket, "session_id": session_id})
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Broadcast to other clients in the same session
            for conn in websocket_connections:
                if conn["session_id"] == session_id and conn["websocket"] != websocket:
                    try:
                        await conn["websocket"].send_text(data)
                    except:
                        websocket_connections.remove(conn)
                        
    except Exception as e:
        logging.error(f"WebSocket error: {str(e)}")
    finally:
        websocket_connections = [conn for conn in websocket_connections if conn["websocket"] != websocket]

# Basic health check endpoints
@api_router.get("/")
async def root():
    return {"message": "DARK AI Backend is running"}

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "DARK AI"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()