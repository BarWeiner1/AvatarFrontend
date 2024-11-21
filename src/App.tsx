import { useState } from 'react';

interface Message {
  text: string;
  isUser: boolean;
  timestamp: string;
}

function App() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageHistory, setMessageHistory] = useState<Message[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    const userMessage = {
      text: message,
      isUser: true,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessageHistory(prev => [...prev, userMessage]);

    try {
      const res = await fetch('https://michael-levitt-ai-backend-a5ed710976c3.herokuapp.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setResponse(data.text);
      
      const aiMessage = {
        text: data.text,
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessageHistory(prev => [...prev, aiMessage]);
      
      // Play audio if available
      if (data.audio) {
        console.log('Received audio Base64:', data.audio);
        const audioBlob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.play();
      }
    } catch (error) {
      console.error('Error:', error);
      setResponse('Sorry, there was an error processing your request.');
      const errorMessage = {
        text: 'Sorry, there was an error processing your request.',
        isUser: false,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessageHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg p-6">
        <div className="text-2xl font-bold text-center mb-6">
          Chat with Michael Levitt AI
        </div>
        
        <div className="space-y-4">
          <div className="min-h-[200px] p-4 bg-gray-50 rounded-lg border">
            {response ? (
              <div className="text-gray-700">{response}</div>
            ) : (
              <div className="text-gray-400 italic">
                Ask me anything about computational biology or COVID-19 research...
              </div>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Send'
              )}
            </button>
          </form>

          {/* Message History */}
          {messageHistory.length > 0 && (
            <div className="mt-8">
              <div className="text-lg font-semibold mb-2">Message History</div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {messageHistory.map((msg, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded ${
                      msg.isUser ? 'bg-blue-100' : 'bg-gray-100'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">
                        {msg.isUser ? 'You' : 'AI'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {msg.timestamp}
                      </span>
                    </div>
                    <div className="text-sm">{msg.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;