"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { Brain } from "lucide-react";

interface LoginViewProps {
  status: "loading" | "authenticated" | "unauthenticated";
  session: any;
  onLoginSuccess: (email: string) => void;
}

export default function LoginView({ status, session, onLoginSuccess }: LoginViewProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || (isSignUp && !usernameInput)) {
      setLoginError("Please fill in all required fields.");
      return;
    }
    setIsLoggingIn(true);
    setLoginError("");

    // For prototyping, both Login and Signup use the same Credentials Provider
    const res = await signIn("credentials", {
      redirect: false,
      username: usernameInput,
      email: emailInput,
      password: passwordInput,
    });

    setIsLoggingIn(false);

    if (res?.error) {
      setLoginError(isSignUp ? "Sign up failed. Please try again." : "Invalid credentials. Please try again.");
    } else {
      setUsernameInput("");
      setEmailInput("");
      setPasswordInput("");

      if (emailInput) {
        onLoginSuccess(emailInput);
      }
    }
  };

  return (
    <main className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 max-w-md mx-auto w-full text-center">
      <h2 className="inline-flex items-center gap-3 text-4xl font-extrabold text-[#001864] mb-8 tracking-tight">
        <Brain className="w-9 h-9 text-primary" />
        BioTrace
      </h2>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
        {isSignUp ? "Create Account" : "Login"}
      </h1>
      <p className="text-slate-600 mb-8">
        {isSignUp
          ? "Register to securely track your learning progress."
          : "Welcome to the Simulation Center."}
      </p>

      {status === "loading" || session ? (
        <div className="w-full flex items-center justify-center p-4">
          <div className="animate-pulse text-slate-600 font-medium">Loading Dashboard...</div>
        </div>
      ) : (
        <div className="w-full flex flex-col gap-6">
          <form onSubmit={handleAuth} className="w-full flex flex-col gap-4">
            {loginError && (
              <div className="text-sm font-medium text-red-400 bg-red-950/50 py-2 px-4 rounded-lg border border-red-900/50">
                {loginError}
              </div>
            )}
            {isSignUp && (
              <input
                type="text"
                placeholder="Username"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
                required
              />
            )}
            <input
              type="email"
              placeholder="University Email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 focus:outline-none focus:border-primary/50 transition-colors placeholder:text-slate-600"
              required
            />
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 mt-2 bg-primary hover:bg-primary-hover text-white rounded-full font-semibold transition-all shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingIn
                ? "Authenticating..."
                : isSignUp
                ? "Create Account"
                : "Log In"}
            </button>
          </form>

          <div className="text-sm text-slate-500">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLoginError("");
              }}
              className="text-primary hover:text-primary-hover font-medium transition-colors cursor-pointer"
            >
              {isSignUp ? "Log In" : "Sign Up"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
