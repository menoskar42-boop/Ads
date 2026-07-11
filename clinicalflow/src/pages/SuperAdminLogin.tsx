import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Lock, Eye, EyeOff } from 'lucide-react';

/**
 * Hidden super-admin login.
 * URL: /cf-admin-access  — not linked anywhere in the public UI.
 * Only the platform owner knows this URL.
 */
const SuperAdminLogin: React.FC = () => {
  const { loginAsSuperAdmin } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState(false);
  const [attempts, setAttempts]   = useState(0);
  const [locked, setLocked]       = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || !password) return;

    const ok = loginAsSuperAdmin(password);
    if (ok) {
      navigate('/super-admin', { replace: true });
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setError(true);
      setPassword('');
      if (next >= 5) {
        setLocked(true);
        setTimeout(() => { setLocked(false); setAttempts(0); setError(false); }, 30_000);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <Shield className="h-6 w-6 text-violet-400" />
          </div>
        </div>

        <Card className="border-gray-800 bg-gray-900 shadow-2xl">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-white text-lg">Platform Administration</CardTitle>
            <CardDescription className="text-gray-400">Authorized access only</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              <div className="space-y-1.5">
                <Label htmlFor="admin-pass" className="text-gray-300 text-sm">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <Input
                    id="admin-pass"
                    type={showPass ? 'text' : 'password'}
                    className="pl-9 pr-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus:border-violet-500"
                    placeholder="••••••••••••"
                    autoComplete="new-password"
                    value={password}
                    disabled={locked}
                    onChange={e => { setPassword(e.target.value); setError(false); }}
                    data-testid="input-superadmin-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && !locked && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                  Incorrect password.{attempts >= 3 ? ` ${5 - attempts} attempt(s) remaining.` : ''}
                </p>
              )}
              {locked && (
                <p className="text-sm text-amber-400 bg-amber-950/40 border border-amber-800/40 rounded px-3 py-2">
                  Access temporarily locked. Please wait 30 seconds.
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-violet-600 hover:bg-violet-700 text-white"
                disabled={locked || !password}
                data-testid="button-superadmin-login"
              >
                Access Panel
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-700 mt-6">
          Unauthorized access attempts are logged.
        </p>
      </div>
    </div>
  );
};

export default SuperAdminLogin;
