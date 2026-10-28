import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { GoogleLogin } from '@react-oauth/google';
import { authRequest, type AuthAccount, setAuthToken } from '../services/authClient';

interface AuthModalProps { onLogin: (user: AuthAccount) => Promise<void> | void; onBack: () => void; googleAuthEnabled: boolean; }
type Mode = 'login' | 'register' | 'invite' | 'verify' | 'forgot' | 'reset';
type AuthResponse = { user: AuthAccount; token: string; };

export function getAvatarPlaceholder(name: string): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'Operator')}&background=0284c7&color=ffffff&bold=true`;
}

export function AuthModal({ onLogin, onBack, googleAuthEnabled }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = ({ login: 'Welcome back', register: 'Create your account', invite: 'Accept an invitation', verify: 'Verify your email', forgot: 'Reset your password', reset: 'Choose a new password' } as const)[mode];

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      if (mode === 'register') {
        const result = await authRequest<{ message: string }>('/api/auth/register/request-code', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        setNotice(result.message); setMode('verify');
      } else if (mode === 'invite') {
        const result = await authRequest<AuthResponse>('/api/auth/register/verify-code', { method: 'POST', body: JSON.stringify({ email, code, password }) });
        setAuthToken(result.token); await onLogin(result.user);
      } else if (mode === 'verify') {
        const result = await authRequest<AuthResponse>('/api/auth/register/verify-code', { method: 'POST', body: JSON.stringify({ email, code, password }) });
        setAuthToken(result.token); await onLogin(result.user);
      } else if (mode === 'login') {
        const result = await authRequest<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setAuthToken(result.token, rememberMe); await onLogin(result.user);
      } else if (mode === 'forgot') {
        const result = await authRequest<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
        setNotice(result.message); setMode('reset');
      } else {
        const result = await authRequest<{ message: string }>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, password }) });
        setNotice(result.message); setPassword(''); setCode(''); setMode('login');
      }
    });
  };
  const signInWithGoogle = (idToken?: string) => {
    if (!idToken) { setError('Google did not return a sign-in token. Please try again.'); return; }
    void run(async () => { const result = await authRequest<AuthResponse>('/api/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }); setAuthToken(result.token, rememberMe); await onLogin(result.user); });
  };
  const fieldStyle: React.CSSProperties = { width: '100%', padding: '12px 12px 12px 38px', background: 'rgba(30,41,59,.8)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, color: 'white', fontSize: 13, boxSizing: 'border-box' };
  const field = (icon: React.ReactNode, props: React.InputHTMLAttributes<HTMLInputElement>) => <div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 12, top: 13, color: '#64748b', display: 'flex' }}>{icon}</span><input {...props} style={fieldStyle} required /></div>;

  return <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,.95)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
    <section className="auth-card" style={{ width: 'min(420px, 100%)', padding: 32, background: 'rgba(15,23,42,.98)', border: '1px solid rgba(56,189,248,.3)', borderRadius: 16, boxShadow: '0 0 32px rgba(56,189,248,.18)', color: '#f8fafc' }}>
      <button onClick={onBack} style={{ marginBottom: 16, background: 'none', border: 0, color: '#7dd3fc', fontSize: 12, cursor: 'pointer' }}>← Back to Aetheria</button>
      <header style={{ textAlign: 'center', marginBottom: 24 }}><div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(2,132,199,.2)', border: '1px solid #38bdf8', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><ShieldCheck size={26} color="#38bdf8" /></div><h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{title}</h1><p style={{ margin: '7px 0 0', fontSize: 13, color: '#94a3b8' }}>{mode === 'register' ? 'Create an Aetheria account with a verified email.' : mode === 'invite' ? 'Enter the email address the invitation was sent to.' : mode === 'verify' ? `Enter the six-digit code sent to ${email}.` : mode === 'forgot' ? 'We’ll email a one-time password reset code.' : mode === 'reset' ? 'Verify the code and choose a new password.' : 'Sign in with your verified email and password.'}</p></header>
      {mode === 'login' && googleAuthEnabled && <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><GoogleLogin onSuccess={(response) => signInWithGoogle(response.credential)} onError={() => setError('Google sign-in failed.')} theme="filled_black" shape="pill" /></div>}
      {notice && <div role="status" style={{ color: '#6ee7b7', background: 'rgba(16,185,129,.08)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>{notice}</div>}
      {error && <div role="alert" style={{ color: '#f87171', background: 'rgba(239,68,68,.08)', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12 }}>{error}</div>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'register' && field(<User size={16} />, { type: 'text', autoComplete: 'name', placeholder: 'Display name', value: name, onChange: (event) => setName(event.target.value), minLength: 2, maxLength: 80 })}
        {field(<Mail size={16} />, { type: 'email', autoComplete: 'email', placeholder: 'Email address', value: email, onChange: (event) => setEmail(event.target.value), disabled: mode === 'verify' || mode === 'reset' })}
        {(mode === 'invite' || mode === 'verify' || mode === 'reset') && field(<ShieldCheck size={16} />, { type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', placeholder: '6-digit email code', value: code, onChange: (event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6)), pattern: '\\d{6}', minLength: 6, maxLength: 6 })}
        {(mode === 'login' || mode === 'register' || mode === 'invite' || mode === 'verify' || mode === 'reset') && <div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 12, top: 13, color: '#64748b', display: 'flex' }}><Lock size={16} /></span><input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Password' : 'Password (at least 10 characters)'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === 'login' ? 1 : 10} maxLength={200} required style={{ ...fieldStyle, paddingRight: 44 }} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} title={showPassword ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 8, top: 7, width: 32, height: 32, display: 'grid', placeItems: 'center', border: 0, borderRadius: 6, background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>}
        {mode === 'login' && <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#cbd5e1', fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} style={{ accentColor: '#0284c7' }} />Remember me</label>}
        <button disabled={busy} type="submit" style={{ marginTop: 4, padding: 12, background: busy ? '#334155' : '#0284c7', border: 0, borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Please wait…' : ({ login: 'Sign in', register: 'Send verification code', invite: 'Accept invitation', verify: 'Verify and create account', forgot: 'Send reset code', reset: 'Save new password' } as const)[mode]} <ArrowRight size={15} /></button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        {mode === 'login' ? <><button onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} style={linkStyle}>Forgot password?</button><button onClick={() => { setMode('invite'); setError(''); setNotice(''); }} style={linkStyle}>Have an invite?</button><button onClick={() => { setMode('register'); setError(''); setNotice(''); }} style={linkStyle}>Create account</button></> : <><button onClick={() => { setMode('login'); setError(''); setNotice(''); }} style={linkStyle}><ArrowLeft size={13} /> Back to sign in</button>{mode === 'invite' && <button disabled={busy} onClick={() => void run(async () => { const result = await authRequest<{ message: string }>('/api/auth/invite/request-code', { method: 'POST', body: JSON.stringify({ email }) }); setNotice(result.message); })} style={linkStyle}>Send a fresh invite code</button>}{mode === 'verify' && <button disabled={busy} onClick={() => { setPassword(''); setCode(''); setMode('register'); }} style={linkStyle}>Start over</button>}</>}
        {(mode === 'verify' || mode === 'reset') && <button onClick={() => { setCode(''); setMode(mode === 'verify' ? 'register' : 'forgot'); }} style={linkStyle}>Request a new code</button>}
      </div>
      {!googleAuthEnabled && mode === 'login' && <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', margin: '14px 0 0' }}>Google sign-in can be enabled by setting <code>VITE_GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_ID</code>.</p>}
    </section>
  </div>;
}

const linkStyle: React.CSSProperties = { background: 'none', border: 0, color: '#7dd3fc', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 };
