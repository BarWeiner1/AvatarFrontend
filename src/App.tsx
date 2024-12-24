import { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { collection, addDoc, query, orderBy, where, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { SignIn } from './components/SignIn';

// Add type declaration for window.currentAudio and HTMLAudioElement
declare global {
  interface Window {
    currentAudio: HTMLAudioElement | null;
  }
  interface HTMLAudioElement {
    playsInline: boolean;
  }
}

window.currentAudio = null;

interface Message {
  text: string;
  isUser: boolean;
  timestamp: string;
  userId: string;
  conversationId: string;
}

interface Conversation {
  id: string;
  title: string;
  userId: string;
  timestamp: string;
  lastMessage: string;
}

function App() {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  const loadConversations = useCallback(async (userId: string) => {
    const q = query(
      collection(db, 'conversations'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const conversationsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Conversation));
      setConversations(conversationsData);
    });

    return unsubscribe;
  }, []);

  // Authentication listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // First load conversations
        await loadConversations(user.uid);
        // Then create a new conversation and set it as current
        const newConversationRef = await addDoc(collection(db, 'conversations'), {
          title: 'New Conversation',
          userId: user.uid,
          timestamp: new Date().toISOString(),
          lastMessage: ''
        });
        setCurrentConversationId(newConversationRef.id);
      } else {
        setMessageHistory([]);
        setConversations([]);
        setCurrentConversationId(null);
      }
    });

    return () => unsubscribe();
  }, [loadConversations]);

  // Focus input field when conversation is created
  useEffect(() => {
    if (currentConversationId) {
      setTimeout(() => {
        const inputField = document.getElementById('message-input') as HTMLInputElement;
        if (inputField) {
          inputField.focus();
          inputField.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [currentConversationId]);

  useEffect(() => {
    if (user && currentConversationId) {
      loadMessages(currentConversationId);
    }
  }, [currentConversationId, user]);

  const createNewConversation = async () => {
    if (!user) return;
    
    const newConversation: Omit<Conversation, 'id'> = {
      title: 'New Conversation',
      userId: user.uid,
      timestamp: new Date().toISOString(),
      lastMessage: ''
    };

    const docRef = await addDoc(collection(db, 'conversations'), newConversation);
    setCurrentConversationId(docRef.id);
  };

  // Update loadMessages to filter by conversationId
  const loadMessages = async (conversationId: string) => {
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', conversationId),
      orderBy('timestamp')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => doc.data() as Message);
      setMessageHistory(messages);
    });

    return unsubscribe;
  };

  // Updated handleSubmit to include user context and Firebase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading || !user || !currentConversationId) return;

    setIsLoading(true);
    
    // Create user message
    const userMessage: Message = {
      text: message,
      isUser: true,
      timestamp: new Date().toLocaleTimeString(),
      userId: user.uid,
      conversationId: currentConversationId
    };

    try {
      // Save user message to Firestore
      await addDoc(collection(db, 'messages'), userMessage);
      
      // Get full conversation context with better structure
      const conversationContext = messageHistory
        .map(msg => ({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.text,
          timestamp: msg.timestamp
        }))
        .map(msg => JSON.stringify(msg))
        .join('\n---\n');

      const res = await fetch('https://michael-levitt-ai-backend-a5ed710976c3.herokuapp.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://mikeagent.netlify.app'
        },
        mode: 'cors',
        credentials: 'omit',
        body: JSON.stringify({ 
          message,
          context: conversationContext,
          messageHistory: messageHistory.slice(-5) // Send last 5 messages for immediate context
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Create AI message
      const aiMessage: Message = {
        text: data.text,
        isUser: false,
        timestamp: new Date().toLocaleTimeString(),
        userId: user.uid,
        conversationId: currentConversationId
      };

      // Save AI response to Firestore
      await addDoc(collection(db, 'messages'), aiMessage);

      // Update conversation last message
      const conversationRef = doc(db, 'conversations', currentConversationId);
      const updateData: { lastMessage: string; timestamp: string; title?: string } = {
        lastMessage: data.text.slice(0, 100),
        timestamp: new Date().toISOString()
      };
      
      // Only set title if this is the first message
      if (messageHistory.length === 0) {
        updateData.title = message.slice(0, 50);
      }
      
      await updateDoc(conversationRef, updateData);
      
      // Always play audio response
      if (data.audio) {
        try {
          const audioBlob = new Blob(
            [Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], 
            { type: 'audio/mp3; codecs=mp3' }
          );
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio();
          
          // Set up audio properties before loading the source
          audio.preload = 'auto';
          audio.playsInline = true;
          
          // Make sure previous audio is stopped before playing new one
          if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio.src = '';
            URL.revokeObjectURL(window.currentAudio.src);
          }
          
          // Set up event listeners
          audio.addEventListener('canplaythrough', async () => {
            try {
              // Attempt to play with user gesture requirement handling
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                await playPromise;
              }
            } catch (playError) {
              console.error('Error during audio playback:', playError);
              // If autoplay failed, we might want to show a play button
              // or retry with user interaction
            }
          });

          audio.addEventListener('error', (e) => {
            console.error('Audio error:', e);
          });

          // Clean up when done
          audio.addEventListener('ended', () => {
            URL.revokeObjectURL(audioUrl);
            window.currentAudio = null;
          });

          // Set the source last
          audio.src = audioUrl;
          window.currentAudio = audio;

        } catch (audioError) {
          console.error('Error setting up audio:', audioError);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
      setMessage('');
    }
  };

  // New: Handle sign out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Add delete conversation function
  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the conversation selection
    if (!user) return;

    try {
      // Delete the conversation document
      await deleteDoc(doc(db, 'conversations', conversationId));

      // Delete all messages in the conversation
      const messagesQuery = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      const messagesSnapshot = await getDocs(messagesQuery);
      const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      // If the deleted conversation was selected, clear the current conversation
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessageHistory([]);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  // New: Show sign in page if no user
  if (!user) {
    return <SignIn />;
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-3 mb-4">
            {user.photoURL && (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                className="w-8 h-8 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{user.displayName}</div>
              <div className="text-xs text-gray-500 truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={createNewConversation}
            className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            New Chat
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group relative hover:bg-gray-100 ${
                currentConversationId === conv.id ? 'bg-gray-100' : ''
              }`}
            >
              <button
                onClick={() => setCurrentConversationId(conv.id)}
                className="w-full p-3 text-left flex flex-col gap-1"
              >
                <div className="font-medium truncate">{conv.title}</div>
                <div className="text-xs text-gray-500 truncate">{conv.lastMessage}</div>
              </button>
              <button
                onClick={(e) => deleteConversation(conv.id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-2 text-gray-500 hover:text-red-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        
        <div className="p-3 border-t">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-6 flex flex-col max-w-4xl mx-auto w-full">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto mb-4 overflow-hidden rounded-lg shadow-md">
              <img
                src="/michael-levitt.jpg"
                alt="Michael Levitt"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-2xl font-bold text-center">
              Chat with Michael Levitt AI
            </div>
          </div>

          <div className="flex-1 overflow-y-auto mb-4">
            <div className="space-y-4">
              {messageHistory.map((msg, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg ${
                    msg.isUser ? 'bg-blue-100 ml-12' : 'bg-gray-100 mr-12'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">
                      {msg.isUser ? user.displayName || 'You' : 'Michael Levitt AI'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {msg.timestamp}
                    </span>
                  </div>
                  <div>{msg.text}</div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading || !currentConversationId}
              id="message-input"
              name="message"
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading || !currentConversationId}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Send'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default App;