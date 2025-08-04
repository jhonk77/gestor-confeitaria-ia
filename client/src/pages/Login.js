import React, { useState } from 'react';
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '../services/firebase'; // Importa a instância inicializada do app

function Login() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const auth = getAuth(app);
    const functions = getFunctions(app);

    const handleAuthSuccess = async (user) => {
        try {
            // Garante que o perfil do usuário seja criado ou atualizado no backend
            const setupUser = httpsCallable(functions, 'setupUser');
            await setupUser({ 
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL
            });
            window.location.href = '/dashboard';
        } catch (err) {
            setError(`Erro ao configurar o perfil: ${err.message}`);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            await handleAuthSuccess(result.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEmailPasswordSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (isLogin) {
            // Login
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                window.location.href = '/dashboard'; // Redireciona direto, perfil já deve existir
            } catch (err) {
                setError('Email ou senha inválidos.');
            }
        } else {
            // Cadastro
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await updateProfile(userCredential.user, { displayName });
                await handleAuthSuccess(userCredential.user);
            } catch (err) {
                if (err.code === 'auth/email-already-in-use') {
                    setError('Este email já está em uso.');
                } else {
                    setError('Erro ao criar a conta. A senha deve ter pelo menos 6 caracteres.');
                }
            }
        }
        setLoading(false);
    };

    return (
        <div className="container vh-100 d-flex justify-content-center align-items-center">
            <div className="card p-4" style={{ width: '100%', maxWidth: '400px' }}>
                <h3 className="text-center mb-4">{isLogin ? 'Login' : 'Criar Conta'}</h3>
                
                {error && <div className="alert alert-danger">{error}</div>}

                <form onSubmit={handleEmailPasswordSubmit}>
                    {!isLogin && (
                        <div className="mb-3">
                            <label className="form-label">Nome</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                value={displayName} 
                                onChange={(e) => setDisplayName(e.target.value)} 
                                required 
                            />
                        </div>
                    )}
                    <div className="mb-3">
                        <label className="form-label">Email</label>
                        <input 
                            type="email" 
                            className="form-control" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className="mb-3">
                        <label className="form-label">Senha</label>
                        <input 
                            type="password" 
                            className="form-control" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                    </div>
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                        {loading ? 'Aguarde...' : (isLogin ? 'Entrar' : 'Cadastrar')}
                    </button>
                </form>

                <div className="text-center my-3">ou</div>

                <button onClick={handleGoogleSignIn} className="btn btn-light border w-100 mb-3" disabled={loading}>
                    <img src="https://img.icons8.com/color/16/000000/google-logo.png" alt="Google" className="me-2"/>
                    Entrar com Google
                </button>

                <div className="text-center">
                    <button onClick={() => setIsLogin(!isLogin)} className="btn btn-link">
                        {isLogin ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça login'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default Login;
