"use client";

import { Navbar } from "@/components";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserData {
  ID: string;
  Nombre: string;
  Cedula: number;
  Hash?: string;
  Salt?: string;
  Cargo: string;
  ID_Chat: number;
  Estado_Operador: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'cedula' | 'password' | 'setPassword'>('cedula');
  const [userData, setUserData] = useState<UserData | null>(null);
  const [cedula, setCedula] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validateCedula = async (cedulaValue: string) => {
    console.log('🔍 [Frontend] Validando cédula:', cedulaValue);
    
    if (!cedulaValue.trim()) {
      console.log('❌ [Frontend] Cédula vacía');
      setError('Por favor ingresa tu cédula');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('🚀 [Frontend] Enviando petición a /api/validate-cedula');
      const response = await fetch(`/api/validate-cedula`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cedula: cedulaValue }), // Enviar como string, no como int
      });

      console.log('📡 [Frontend] Respuesta recibida - Status:', response.status);
      const data = await response.json();
      console.log('📊 [Frontend] Datos recibidos:', data);

      if (response.ok && data.exists) {
        console.log('✅ [Frontend] Usuario válido encontrado');
        setUserData(data.user);
        setStep(data.hasPassword ? 'password' : 'setPassword');
      } else {
        console.log('❌ [Frontend] Usuario no encontrado o error');
        setError(data.message || 'Cédula no encontrada en el sistema');
      }
    } catch (error) {
      console.error('💥 [Frontend] Error en validateCedula:', error);
      setError('Error al validar la cédula. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!password.trim()) {
      setError('Por favor ingresa tu contraseña');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          cedula: userData!.Cedula, 
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Guardar sesión
        localStorage.setItem('userSession', JSON.stringify({
          user: userData,
          loginTime: new Date().toISOString()
        }));
        
        // Redireccionar al home
        router.push('/');
      } else {
        setError(data.message || 'Contraseña incorrecta');
      }
    } catch (error) {
      setError('Error al iniciar sesión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!password.trim() || !confirmPassword.trim()) {
      setError('Por favor completa ambos campos de contraseña');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          cedula: userData!.Cedula, 
          password 
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Guardar sesión
        localStorage.setItem('userSession', JSON.stringify({
          user: userData,
          loginTime: new Date().toISOString()
        }));
        
        // Redireccionar al home
        router.push('/');
      } else {
        setError(data.message || 'Error al establecer la contraseña');
      }
    } catch (error) {
      setError('Error al establecer la contraseña. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step === 'cedula') {
      validateCedula(cedula);
    } else if (step === 'password') {
      handlePasswordLogin();
    } else if (step === 'setPassword') {
      handleSetPassword();
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  const resetForm = () => {
    setStep('cedula');
    setUserData(null);
    setCedula('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  return (
    <div 
      className="min-h-screen relative font-museo-slab"
      style={{
        backgroundImage: 'url(/blend.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay for better readability */}
      <div className="absolute inset-0 bg-black/30 z-10"></div>
      
      {/* Content */}
      <div className="relative z-20 min-h-screen flex flex-col">
        {/* Navbar Component */}
        <Navbar />

        {/* Login Form Section */}
        <main className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="w-full max-w-md">
            {/* Translucent Login Container */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">
                  {step === 'cedula' ? 'Acceso al Sistema' : 
                   step === 'password' ? `Bienvenido ${userData?.Nombre}` : 
                   'Configurar Contraseña'}
                </h1>
                <p className="text-gray-200">
                  {step === 'cedula' ? 'Ingresa tu número de cédula' : 
                   step === 'password' ? 'Ingresa tu contraseña para continuar' : 
                   'Establece una contraseña para tu cuenta'}
                </p>
              </div>

              {error && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-200 text-center">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {step === 'cedula' && (
                  <div>
                    <label htmlFor="cedula" className="block text-sm font-medium text-white mb-2">
                      Cédula
                    </label>
                    <input
                      type="text"
                      id="cedula"
                      value={cedula}
                      onChange={(e) => setCedula(e.target.value)}
                      required
                      disabled={loading}
                      className="w-full px-4 py-3 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#5A7836] focus:border-transparent backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
                      placeholder="Ingresa tu número de cédula"
                    />
                  </div>
                )}

                {step === 'password' && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
                      Contraseña
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        className="w-full px-4 py-3 pr-12 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#5A7836] focus:border-transparent backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={togglePasswordVisibility}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-white transition-colors duration-200"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {step === 'setPassword' && (
                  <>
                    <div>
                      <label htmlFor="newPassword" className="block text-sm font-medium text-white mb-2">
                        Nueva Contraseña
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          id="newPassword"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          disabled={loading}
                          className="w-full px-4 py-3 pr-12 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#5A7836] focus:border-transparent backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
                          placeholder="Mínimo 6 caracteres"
                        />
                        <button
                          type="button"
                          onClick={togglePasswordVisibility}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-white transition-colors duration-200"
                        >
                          {showPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-white mb-2">
                        Confirmar Contraseña
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          id="confirmPassword"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          disabled={loading}
                          className="w-full px-4 py-3 pr-12 bg-white/20 border border-white/30 rounded-lg text-white placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#5A7836] focus:border-transparent backdrop-blur-sm transition-all duration-300 disabled:opacity-50"
                          placeholder="Repite la contraseña"
                        />
                        <button
                          type="button"
                          onClick={toggleConfirmPasswordVisibility}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-300 hover:text-white transition-colors duration-200"
                        >
                          {showConfirmPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-4">
                  {step !== 'cedula' && (
                    <button
                      type="button"
                      onClick={resetForm}
                      disabled={loading}
                      className="flex-1 bg-gray-600 text-white py-3 px-4 rounded-lg font-semibold transition-all duration-300 transform hover:bg-gray-700 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Atrás
                    </button>
                  )}
                  
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-[#5A7836] text-white py-3 px-4 rounded-lg font-semibold transition-all duration-300 transform hover:bg-[#4a6429] hover:scale-105 hover:shadow-lg hover:shadow-[#5A7836]/30 active:scale-95 focus:outline-none focus:ring-4 focus:ring-[#5A7836]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Procesando...' : 
                     step === 'cedula' ? 'Continuar' :
                     step === 'password' ? 'Acceder a la plataforma' :
                     'Establecer contraseña'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
