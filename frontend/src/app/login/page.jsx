"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchApi } from "@/lib/api";
import { Mail, ShieldCheck, ArrowRight, Eye, EyeOff, CheckCircle2 } from "lucide-react";

// ─── Registration: Two-step OTP flow ─────────────────────────────────────────

function RegisterForm() {
  const router = useRouter();
  const [step, setStep] = useState("details");
  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetchApi("/request-otp", {
        method: "POST",
        body: JSON.stringify({ email: regEmail, full_name: fullName }),
      });
      setSuccess(`OTP sent to ${regEmail}. Check your inbox!`);
      setStep("otp");
    } catch (err) {
      setError(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fetchApi("/register", {
        method: "POST",
        body: JSON.stringify({
          email: regEmail,
          password: regPassword,
          full_name: fullName,
          otp_code: otpCode,
        }),
      });
      // Auto-login after registration
      const loginData = await fetchApi("/login", {
        method: "POST",
        body: JSON.stringify({ email: regEmail, password: regPassword }),
      });
      if (loginData.token) {
        localStorage.setItem("jwt_token", loginData.token);
        router.push("/");
      }
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive-foreground mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-emerald-500/10 border-emerald-500/30 text-emerald-400 mb-4">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {step === "details" && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          {/* Step indicator */}
          <div className="flex items-center space-x-2 mb-6">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">1</div>
            <div className="flex-1 h-0.5 bg-slate-800"></div>
            <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">2</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-name">Full Name</Label>
            <Input
              id="reg-name"
              placeholder="Sathvik Reddy"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="bg-background/50 border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email">Work Email</Label>
            <Input
              id="reg-email"
              type="email"
              placeholder="admin@company.com"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              required
              className="bg-background/50 border-border"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <div className="relative">
              <Input
                id="reg-password"
                type={showRegPassword ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
                className="bg-background/50 border-border pr-10"
              />
              <button
                type="button"
                onClick={() => setShowRegPassword(!showRegPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showRegPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500" disabled={loading}>
            {loading ? "Sending OTP..." : <span className="flex items-center justify-center gap-2"><Mail size={16} /> Send Verification Code <ArrowRight size={16} /></span>}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="flex items-center space-x-2 mb-6">
            <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-xs font-bold text-white">✓</div>
            <div className="flex-1 h-0.5 bg-indigo-500"></div>
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">2</div>
          </div>

          <div className="text-center mb-4">
            <p className="text-sm text-slate-400">Enter the 6-digit code sent to</p>
            <p className="text-white font-medium">{regEmail}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="otp">Verification Code</Label>
            <Input
              id="otp"
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              className="bg-background/50 border-border text-center text-2xl font-mono tracking-[0.5em]"
              required
            />
          </div>

          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500" disabled={loading}>
            {loading ? "Creating Account..." : <span className="flex items-center justify-center gap-2"><ShieldCheck size={16} /> Verify & Create Account</span>}
          </Button>

          <button
            type="button"
            onClick={() => { setStep("details"); setError(""); setSuccess(""); }}
            className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            ← Change email or resend OTP
          </button>
        </form>
      )}
    </>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await fetchApi("/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.token) {
        localStorage.setItem("jwt_token", data.token);
        router.push("/");
      }
    } catch (err) {
      setError(err.message || "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  };

  const features = [
    "AI Root Cause Analysis",
    "GitHub Pipeline Intelligence",
    "Azure and AWS Resource Intelligence",
    "Cost and Risk Insights",
    "Architecture Diagram Generation"
  ];

  return (
    <div className="flex min-h-screen bg-[#0f172a] text-slate-200">
      
      {/* Left Panel - Hero/Branding */}
      <div className="hidden lg:flex w-1/2 flex-col justify-center p-12 lg:p-24 relative overflow-hidden bg-gradient-to-br from-indigo-900/40 via-background to-[#020617] border-r border-slate-800/50">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
        
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-[120px]"></div>
        
        <div className="relative z-10 space-y-8 max-w-lg">
          <Image src="/resolveops-logo.svg" alt="ResolveOps AI" width={250} height={60} className="mb-4" />
          
          <div className="space-y-4">
            <h1 className="text-4xl lg:text-5xl font-bold tracking-tight text-white leading-tight">
              Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">ResolveOps AI</span>
            </h1>
            <p className="text-lg text-slate-400 leading-relaxed">
              Your AI-powered autonomous SRE command center for cloud, pipeline, cost, and incident intelligence.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            {features.map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <CheckCircle2 className="text-indigo-400 w-5 h-5 flex-shrink-0" />
                <span className="text-slate-300 font-medium">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-4 lg:p-12 relative bg-[#0B0F19]">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex justify-center mb-8">
            <Image src="/resolveops-logo.svg" alt="ResolveOps AI" width={200} height={50} />
          </div>

          <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-800 shadow-2xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-white text-center">Sign In</CardTitle>
              <CardDescription className="text-center text-slate-400">Access your command center</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 bg-slate-950 border border-slate-800 rounded-lg p-1">
                  <TabsTrigger value="login" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-md transition-all">Login</TabsTrigger>
                  <TabsTrigger value="register" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-md transition-all">Register</TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="mt-0">
                  <form onSubmit={handleLogin} className="space-y-5">
                    {error && (
                      <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/20 text-rose-400">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300">Work Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus-visible:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-slate-300">Password</Label>
                        <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline">Forgot password?</a>
                      </div>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          className="bg-slate-950 border-slate-800 text-slate-200 focus-visible:ring-indigo-500 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium h-11" disabled={loading}>
                      {loading ? "Authenticating..." : "Sign In"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="mt-0">
                  <RegisterForm />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          
          <p className="text-center text-sm text-slate-600">
            &copy; {new Date().getFullYear()} ResolveOps AI. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
