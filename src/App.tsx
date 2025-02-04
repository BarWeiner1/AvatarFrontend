import { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import { collection, addDoc, query, orderBy, where, onSnapshot, doc, updateDoc, deleteDoc, getDocs, getDoc, setDoc } from 'firebase/firestore';
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
  const [isAddingContext, setIsAddingContext] = useState(false);
  const [contextInput, setContextInput] = useState('');
  const [globalContext, setGlobalContext] = useState<string>('');

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

  // Load global context on startup
  useEffect(() => {
    const loadGlobalContext = async () => {
      if (user) {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setGlobalContext(docSnap.data().globalContext || '');
        }
      }
    };
    loadGlobalContext();
  }, [user]);

  // Add function to handle context addition
  const handleAddContext = async () => {
    if (!user || !contextInput.trim()) return;

    try {
      // Save context to user document instead of conversation
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        globalContext: contextInput
      }, { merge: true });
      
      setGlobalContext(contextInput);
      setIsAddingContext(false);
      setContextInput('');
    } catch (error) {
      console.error('Error adding context:', error);
    }
  };

  // Updated handleSubmit to include user context and Firebase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading || !user || !currentConversationId) return;

    setIsLoading(true);
    
    try {
      // Create user message
      const userMessage: Message = {
        text: message,
        isUser: true,
        timestamp: new Date().toLocaleTimeString(),
        userId: user.uid,
        conversationId: currentConversationId
      };

      await addDoc(collection(db, 'messages'), userMessage);
      
      // Get conversation context with global context included
      const conversationContext = messageHistory
        .map(msg => ({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.text,
          timestamp: msg.timestamp
        }))
        .map(msg => JSON.stringify(msg))
        .join('\n---\n');

      // Add global context if it exists
      const fullContext = globalContext 
        ? `Global Context:\n${globalContext}\n\nConversation History:\n${conversationContext}`
        : conversationContext;

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
          context: fullContext,
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
        lastMessage: data.text.length > 50 ? data.text.slice(0, 50) + '...' : data.text,
        timestamp: new Date().toISOString()
      };
      
      // Only set title if this is the first message
      if (messageHistory.length === 0) {
        updateData.title = message.length > 30 ? message.slice(0, 30) + '...' : message;
      }
      
      await updateDoc(conversationRef, updateData);
      
      // Always play audio response
      if (data.audio) {
        try {
          // Convert base64 to blob with explicit typing for iOS
          const byteCharacters = atob(data.audio);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const audioBlob = new Blob([byteArray], { type: 'audio/mpeg' });
          
          // Create audio element with specific attributes for iOS
          const audio = new Audio();
          audio.setAttribute('playsinline', 'true');
          audio.setAttribute('webkit-playsinline', 'true');
          audio.preload = 'auto';
          
          // Stop any currently playing audio
          if (window.currentAudio) {
            window.currentAudio.pause();
            window.currentAudio.src = '';
            URL.revokeObjectURL(window.currentAudio.src);
            window.currentAudio = null;
          }

          // Create object URL
          const audioUrl = URL.createObjectURL(audioBlob);
          
          // Set up event listeners before setting source
          const playAudio = async () => {
            try {
              // Try playing multiple times with small delays
              for (let i = 0; i < 3; i++) {
                try {
                  await audio.play();
                  break; // If successful, exit the loop
                } catch (error) {
                  if (i < 2) { // Don't wait on the last attempt
                    await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
                  }
                }
              }
            } catch (error) {
              console.error('Final playback attempt failed:', error);
            }
          };

          audio.addEventListener('canplaythrough', playAudio, { once: true });
          
          audio.addEventListener('error', (e) => {
            console.error('Audio loading error:', e);
          });

          audio.addEventListener('ended', () => {
            URL.revokeObjectURL(audioUrl);
            window.currentAudio = null;
          });

          // Set source and store reference
          audio.src = audioUrl;
          window.currentAudio = audio;
          
          // Load the audio
          await audio.load();

        } catch (audioError) {
          console.error('Audio setup error:', audioError);
        }
      }

      // Scroll to bottom after new message
      setTimeout(() => {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
      }, 100);
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
    <div className="flex h-screen bg-gray-100">
      {!user ? (
        <SignIn />
      ) : (
        <>
          {/* Sidebar */}
          <div className="w-64 bg-white shadow-lg flex flex-col h-full">
            <div className="p-4 border-b">
              <button
                onClick={createNewConversation}
                className="w-full bg-blue-500 text-white rounded px-4 py-2 hover:bg-blue-600"
              >
                New Chat
              </button>
            </div>
            
            {/* Conversations list - make it scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setCurrentConversationId(conv.id)}
                  className={`p-4 cursor-pointer hover:bg-gray-100 border-b ${
                    currentConversationId === conv.id ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="font-medium">{conv.title}</div>
                  <div className="text-sm text-gray-500 truncate">
                    {conv.lastMessage}
                  </div>
                </div>
              ))}
            </div>

            {/* Sign out button */}
            <div className="p-4 border-t">
              <button
                onClick={() => signOut(auth)}
                className="w-full bg-red-500 text-white rounded px-4 py-2 hover:bg-red-600"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 flex flex-col h-full">
            {/* Header */}
            <div className="bg-white shadow-sm p-4 flex justify-between items-center">
              <h1 className="text-xl font-semibold">Chat with Mike</h1>
              <button
                onClick={() => setIsAddingContext(true)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded"
              >
                Edit Context
              </button>
            </div>

            {/* Messages container - make it scrollable */}
            <div 
              id="messages-container"
              className="flex-1 overflow-y-auto p-4 min-h-0"
            >
              {messageHistory.map((msg, index) => (
                <div
                  key={index}
                  className={`mb-4 ${
                    msg.isUser ? 'text-right' : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-block p-3 rounded-lg ${
                      msg.isUser
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {msg.timestamp}
                  </div>
                </div>
              ))}
            </div>

            {/* Input form - fixed at bottom */}
            <div className="bg-white border-t p-4">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  id="message-input"
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message..."
                  className="flex-1 p-2 border rounded"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`px-4 py-2 rounded ${
                    isLoading
                      ? 'bg-gray-400'
                      : 'bg-blue-500 hover:bg-blue-600'
                  } text-white`}
                >
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Context Modal */}
      {isAddingContext && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-semibold mb-4">Edit Global Context</h2>
            <textarea
              value={contextInput}
              onChange={(e) => setContextInput(e.target.value)}
              className="w-full h-40 p-2 border rounded mb-4"
              placeholder="Add context here..."
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAddingContext(false)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddContext}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;