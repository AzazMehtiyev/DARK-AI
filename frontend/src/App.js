import React, { useState, useEffect, useRef } from "react";
import "./App.css";
import axios from "axios";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { ScrollArea } from "./components/ui/scroll-area";
import { Badge } from "./components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Textarea } from "./components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import Peer from "simple-peer";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DarkAI = () => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [isConfigured, setIsConfigured] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peer, setPeer] = useState(null);
  const [stream, setStream] = useState(null);
  const messagesEndRef = useRef(null);
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Load chat history on component mount
    loadChatHistory();
  }, []);

  const loadChatHistory = async () => {
    try {
      const response = await axios.get(`${API}/chat/history`);
      setMessages(response.data.reverse());
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
  };

  const configureElevenLabs = async () => {
    if (!elevenLabsKey.trim()) {
      toast.error("Lütfen ElevenLabs API key girin");
      return;
    }

    try {
      await axios.post(`${API}/config/elevenlabs`, null, {
        params: { api_key: elevenLabsKey }
      });
      setIsConfigured(true);
      toast.success("ElevenLabs yapılandırıldı!");
    } catch (error) {
      toast.error("ElevenLabs API key geçersiz");
      console.error("ElevenLabs config error:", error);
    }
  };

  const generateTTS = async (text) => {
    if (!isConfigured) return null;

    try {
      const response = await axios.post(`${API}/tts`, {
        text: text
      });
      return response.data.audio_url;
    } catch (error) {
      console.error("TTS error:", error);
      return null;
    }
  };

  const playAudio = (audioUrl) => {
    if (audioRef.current && audioUrl) {
      audioRef.current.src = audioUrl;
      audioRef.current.play().catch(console.error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      message: inputMessage,
      sender: "user",
      timestamp: new Date(),
      has_audio: false
    };

    setMessages(prev => [...prev, userMessage]);
    const currentMessage = inputMessage;
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        message: currentMessage,
        session_id: "main_session"
      });

      const aiMessage = {
        id: Date.now().toString() + "_ai",
        message: response.data.message,
        sender: "ai",
        timestamp: new Date(),
        has_audio: isConfigured
      };

      setMessages(prev => [...prev, aiMessage]);

      // Generate TTS if configured
      if (isConfigured) {
        const audioUrl = await generateTTS(response.data.message);
        if (audioUrl) {
          // Update message with audio
          setMessages(prev => prev.map(msg => 
            msg.id === aiMessage.id 
              ? { ...msg, audio_url: audioUrl }
              : msg
          ));
          // Auto-play audio
          setTimeout(() => playAudio(audioUrl), 500);
        }
      }

    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Mesaj gönderilirken hata oluştu");
    } finally {
      setIsLoading(false);
    }
  };

  const startScreenShare = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });

      setStream(mediaStream);
      setIsScreenSharing(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Create peer connection for screen sharing
      const newPeer = new Peer({
        initiator: true,
        trickle: false,
        stream: mediaStream
      });

      newPeer.on('signal', (data) => {
        console.log('SIGNAL', JSON.stringify(data));
        // Here you would send the signal to other peers via WebSocket
      });

      newPeer.on('connect', () => {
        console.log('PEER CONNECTED');
      });

      setPeer(newPeer);

      // Handle stream end
      mediaStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      toast.success("Ekran paylaşımı başlatıldı");
    } catch (error) {
      console.error("Screen share error:", error);
      toast.error("Ekran paylaşımı başlatılamadı");
    }
  };

  const stopScreenShare = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (peer) {
      peer.destroy();
      setPeer(null);
    }
    setIsScreenSharing(false);
    toast.info("Ekran paylaşımı durduruldu");
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800">
      <Toaster position="top-right" />
      <audio ref={audioRef} preload="auto" />
      
      {/* Header */}
      <div className="backdrop-blur-sm bg-black/30 border-b border-gray-700/50 p-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">AI</span>
            </div>
            <h1 className="text-2xl font-bold text-white">DARK AI</h1>
            <Badge variant="outline" className="text-purple-400 border-purple-400/50">
              v1.0
            </Badge>
          </div>
          
          <div className="flex items-center space-x-3">
            {!isConfigured && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="text-purple-400 border-purple-400/50 hover:bg-purple-400/10">
                    TTS Ayarla
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-gray-900 border-gray-700">
                  <DialogHeader>
                    <DialogTitle className="text-white">Text-to-Speech Yapılandırması</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="ElevenLabs API Key"
                      value={elevenLabsKey}
                      onChange={(e) => setElevenLabsKey(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                      type="password"
                    />
                    <Button onClick={configureElevenLabs} className="w-full bg-purple-600 hover:bg-purple-700">
                      Yapılandır
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            
            <Button
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              variant={isScreenSharing ? "destructive" : "outline"}
              className={isScreenSharing ? "" : "text-green-400 border-green-400/50 hover:bg-green-400/10"}
            >
              {isScreenSharing ? "Durdur" : "Ekran Paylaş"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-100px)]">
        
        {/* Chat Panel */}
        <div className="lg:col-span-2">
          <Card className="h-full backdrop-blur-sm bg-black/40 border-gray-700/50 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-white flex items-center space-x-2">
                <span>💬</span>
                <span>Sohbet</span>
                {isConfigured && (
                  <Badge className="bg-green-600/20 text-green-400 border-green-400/50">
                    🔊 Sesli
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col p-0">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl backdrop-blur-sm ${
                          msg.sender === 'user'
                            ? 'bg-purple-600/20 text-purple-100 border border-purple-500/30'
                            : 'bg-gray-800/60 text-gray-100 border border-gray-600/30'
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{msg.message}</p>
                        {msg.audio_url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-2 h-6 text-xs text-blue-400 hover:text-blue-300"
                            onClick={() => playAudio(msg.audio_url)}
                          >
                            🔊 Dinle
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-600/30 text-gray-100 px-4 py-3 rounded-2xl">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
              
              {/* Message Input */}
              <div className="p-4 border-t border-gray-700/50">
                <div className="flex space-x-2">
                  <Textarea
                    placeholder="DARK AI ile sohbet et..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyPress={handleKeyPress}
                    className="flex-1 min-h-[50px] bg-gray-800/50 border-gray-600/50 text-white placeholder-gray-400 resize-none rounded-2xl"
                    disabled={isLoading}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={isLoading || !inputMessage.trim()}
                    className="px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-2xl"
                  >
                    Gönder
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          
          {/* Screen Share Panel */}
          {isScreenSharing && (
            <Card className="backdrop-blur-sm bg-black/40 border-gray-700/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-sm flex items-center space-x-2">
                  <span>🖥️</span>
                  <span>Ekran Paylaşımı</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  className="w-full h-40 bg-gray-800 rounded-lg object-contain"
                />
              </CardContent>
            </Card>
          )}

          {/* AI Info Panel */}
          <Card className="backdrop-blur-sm bg-black/40 border-gray-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center space-x-2">
                <span>🤖</span>
                <span>AI Bilgi</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">İsim:</span>
                  <span className="text-white">DARK AI</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Geliştirici:</span>
                  <span className="text-white">Azad Mehtiyev</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Platform:</span>
                  <span className="text-white">Emergent</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Sesli Yanıt:</span>
                  <span className={isConfigured ? "text-green-400" : "text-red-400"}>
                    {isConfigured ? "Aktif" : "Pasif"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Features Panel */}
          <Card className="backdrop-blur-sm bg-black/40 border-gray-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-sm flex items-center space-x-2">
                <span>⚡</span>
                <span>Özellikler</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center space-x-2 text-sm">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Doğal Türkçe Sohbet</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isConfigured ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                <span className="text-gray-300">Sesli Yanıtlar</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isScreenSharing ? 'bg-green-400' : 'bg-gray-600'}`}></div>
                <span className="text-gray-300">Ekran Paylaşımı</span>
              </div>
              <div className="flex items-center space-x-2 text-sm">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Kimlik Yanıtları</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

function App() {
  return <DarkAI />;
}

export default App;