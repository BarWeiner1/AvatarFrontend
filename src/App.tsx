import { useState, useEffect } from 'react';

function App() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [testMessage, setTestMessage] = useState('');

  // Test the connection on load
  useEffect(() => {
    fetch('https://michael-levitt-ai-backend-a5ed710976c3.herokuapp.com/test')
      .then(res => res.json())
      .then(data => setTestMessage(data.message))
      .catch(err => console.error('Test failed:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    setIsLoading(true);
    try {
      // First try a simple POST without any body
      const res = await fetch('https://michael-levitt-ai-backend-a5ed710976c3.herokuapp.com/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await res.json();
      setResponse(data.text);
      
    } catch (error) {
      console.error('Error:', error);
      setResponse('Sorry, there was an error processing your request.');
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
        
        {testMessage && (
          <div className="mb-4 p-2 bg-green-100 text-green-700 rounded">
            {testMessage}
          </div>
        )}
        
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
        </div>
      </div>
    </div>
  );
}

export default App;