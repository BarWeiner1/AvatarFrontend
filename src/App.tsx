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
    <div className="min-h-screen flex">
      {/* Sidebar - Fixed width, full height, scrollable content */}
      <div className="w-64 flex flex-col bg-white border-r border-gray-200">
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
        
        {/* Conversations List - Scrollable */}
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

        {/* Sign Out - Fixed at bottom */}
        <div className="p-3 border-t mt-auto">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content Area - Flex column with fixed header and footer */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 overflow-hidden rounded-lg shadow-md">
              <img
                src="/michael-levitt.jpg"
                alt="Michael Levitt"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                Chat with Michael Levitt AI
              </h1>
              <button
                onClick={() => {
                  setContextInput(globalContext); // Set current context when opening modal
                  setIsAddingContext(true);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit Context
              </button>
            </div>
          </div>
        </div>

        {/* Messages Container - Scrollable */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <div className="space-y-4 p-6">
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
        </div>

        {/* Input Form - Fixed at bottom */}
        <div className="border-t bg-white">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                disabled={isLoading || !currentConversationId}
                id="message-input"
                name="message"
                className="flex-1 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={isLoading || !currentConversationId}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Context Modal */}
        {isAddingContext && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Global Context Settings</h3>
                <button
                  onClick={() => setIsAddingContext(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                This context will be used as background information for all your conversations with Michael Levitt AI.
              </p>
              <textarea
                value={contextInput}
                onChange={(e) => setContextInput(e.target.value)}
                placeholder="Add any relevant context that will be used in all conversations..."
                className="w-full h-64 p-4 border rounded-lg mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsAddingContext(false);
                    setContextInput('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddContext}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Save Context
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;