import React from 'react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';

export function SignIn() {
  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Header Section */}
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-indigo-100 mb-4 overflow-hidden">
              <img
                src="/michael-levitt.jpg"
                alt="Michael Levitt"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Chat with Nobel Laureate
            </h1>
            <h2 className="text-xl text-gray-700 font-medium mb-2">
              Michael Levitt
            </h2>
            <p className="text-gray-500 text-sm">
              2013 Nobel Prize in Chemistry
            </p>
          </div>

          {/* Login Section */}
          <div className="p-8 bg-white border-t border-gray-100">
            <div className="space-y-6">
              <button
                onClick={signInWithGoogle}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 border border-gray-300 shadow-sm"
              >
                <img 
                  src="https://www.google.com/favicon.ico" 
                  alt="Google" 
                  className="w-5 h-5"
                />
                <span>Continue with Google</span>
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Secure authentication powered by Google
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quote */}
        <div className="mt-8 text-center">
          <blockquote className="italic text-gray-600">
            "Science is not about being right, it's about being less wrong."
          </blockquote>
          <p className="text-sm text-gray-500 mt-2">- Michael Levitt</p>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}