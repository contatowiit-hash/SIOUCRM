import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  PlayCircle,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppLogo } from '../components/ui/AppLogo';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { useAuth } from '../providers/AuthProvider';
import {
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '../schemas/auth';

type AuthMode = 'login' | 'register' | 'reset' | 'verify';
type AuthTabMode = AuthMode | 'demo';

const authTabs: Array<{ label: string; to: string; mode: AuthTabMode }> = [
  { label: 'Entrar', to: '/login', mode: 'login' },
  { label: 'Criar conta', to: '/cadastro', mode: 'register' },
  { label: 'Demo', to: '/demo/dashboard', mode: 'demo' },
];

const PENDING_CHECKOUT_KEY = 'pendingCheckout';
const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin';

const AuthTabs = ({ active }: { active: AuthMode }) => (
  <div className="grid grid-cols-3 rounded-2xl border border-white/15 bg-white/[0.035] p-1">
    {authTabs.map((tab) => {
      const isActive = tab.mode !== 'demo' && active === tab.mode;
      return (
        <Link
          key={tab.label}
          to={tab.to}
          className={`flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-black transition ${
            isActive
              ? 'border border-neon/35 bg-neon/12 text-white shadow-[0_0_24px_rgba(0,175,255,0.14)]'
              : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          {tab.mode === 'demo' ? <PlayCircle className="h-4 w-4 text-neon" /> : null}
          {tab.label}
        </Link>
      );
    })}
  </div>
);

const AuthShell = ({
  title,
  subtitle,
  active,
  children,
}: {
  title: string;
  subtitle: string;
  active: AuthMode;
  children: ReactNode;
}) => (
  <div className="min-h-screen overflow-hidden bg-[#05070D] px-4 py-6 text-white">
    <div className="pointer-events-none fixed inset-0 bg-radial-grid bg-[length:100%_100%,44px_44px,44px_44px] opacity-80" />
    <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
      <header className="flex items-center justify-between gap-4">
        <AppLogo />
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Início
        </Link>
      </header>

      <main className="grid flex-1 place-items-center py-8">
        <section className="grid w-full max-w-6xl gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-stretch">
          <div className="rounded-[28px] border border-neon/25 bg-[#100A22]/92 p-5 shadow-[0_22px_90px_rgba(76,29,149,0.28)] backdrop-blur-2xl md:p-8">
            <div className="mb-7">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-neon/20 bg-neon/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-sky-100">
                <ShieldCheck className="h-3.5 w-3.5 text-neon" />
                Acesso seguro
              </p>
              <h1 className="text-3xl font-black leading-tight text-white md:text-4xl">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p>
            </div>

            <AuthTabs active={active} />
            <div className="mt-7">{children}</div>
          </div>

          <aside className="rounded-[28px] border border-neon/25 bg-gradient-to-br from-neon/14 via-[#0B1020]/92 to-fuchsia-500/12 p-6 shadow-glow">
            <div className="flex h-full flex-col justify-between gap-8">
              <div>
                <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-neon/15 text-neon">
                  <PlayCircle className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-black text-white">Demo liberada</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Entre no painel de demonstração com dados fictícios e veja o CRM funcionando sem email, senha ou
                  integrações configuradas.
                </p>
              </div>
              <div className="space-y-3">
                {['Dashboard completo', 'Clientes e campanhas', 'WhatsApp e IA'].map((item) => (
                  <div
                    key={item}
                    className="rounded-2xl border border-line bg-white/[0.05] px-4 py-3 text-sm font-bold text-white"
                  >
                    {item}
                  </div>
                ))}
                <Link
                  to="/demo/dashboard"
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-neon px-4 py-3 text-sm font-black text-ink shadow-button transition hover:bg-sky-300"
                >
                  Abrir demo
                  <PlayCircle className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  </div>
);

const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="mt-2 text-xs font-semibold text-rose-200">{message}</p> : null;

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { startApiSession } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(() => {
    if (searchParams.get('verified') === 'true') {
      return { type: 'success', text: 'Email confirmado. Agora voce pode entrar no painel.' };
    }
    if (searchParams.get('verification') === 'expired') {
      return { type: 'error', text: 'Link expirado. Solicite um novo email de confirmacao.' };
    }
    if (searchParams.get('verification') === 'invalid') {
      return { type: 'error', text: 'Link invalido. Solicite um novo email de confirmacao.' };
    }
    return null;
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema) });

  const redirectTo = (() => {
    const pendingCheckout = localStorage.getItem(PENDING_CHECKOUT_KEY);
    const redirectAfterLogin = localStorage.getItem(REDIRECT_AFTER_LOGIN_KEY);
    if (pendingCheckout === 'true' && redirectAfterLogin?.startsWith('/')) return redirectAfterLogin;
    const redirect = searchParams.get('redirect');
    if (redirect?.startsWith('/')) return redirect;
    const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
    return from?.pathname ? `${from.pathname}${from.search || ''}` : '/app/planos';
  })();

  const onSubmit = async (values: LoginInput) => {
    setMessage(null);
    try {
      const auth = await api.login(values);
      startApiSession(auth);
      localStorage.removeItem(PENDING_CHECKOUT_KEY);
      localStorage.removeItem(REDIRECT_AFTER_LOGIN_KEY);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel entrar. Tente novamente.',
      });
    }
  };

  return (
    <AuthShell title="Bem-vindo de volta" subtitle="Entre para acessar seu painel." active="login">
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-violet-200">Email</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-300" />
            <input
              className="form-field h-12 bg-white/[0.08] pl-11 placeholder:text-violet-300/55"
              type="email"
              autoComplete="email"
              placeholder="seu@email.com"
              {...register('email')}
            />
          </div>
          <FieldError message={errors.email?.message} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-violet-200">Senha</span>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-300" />
            <input
              className="form-field h-12 bg-white/[0.08] pl-11 pr-14 placeholder:text-violet-300/55"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className="absolute right-2 top-1/2 grid h-9 w-11 -translate-y-1/2 place-items-center rounded-xl border border-white/15 bg-white/[0.06] text-slate-200 transition hover:bg-white/[0.1]"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <FieldError message={errors.password?.message} />
        </label>
        <div className="flex justify-end text-sm">
          <Link to="/recuperar-senha" className="font-bold text-violet-200 hover:text-white">
            Esqueci a senha
          </Link>
        </div>
        {message ? (
          <div
            className={`rounded-2xl border p-3 text-sm ${
              message.type === 'error'
                ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                : 'border-neon/30 bg-neon/10 text-sky-100'
            }`}
          >
            {message.text}
          </div>
        ) : null}
        <Button
          className="min-h-12 w-full bg-white/[0.06] text-white shadow-[0_0_30px_rgba(124,58,237,0.18)] hover:bg-neon hover:text-ink"
          type="button"
          onClick={handleSubmit(onSubmit)}
          disabled={isSubmitting}
        >
          Entrar no painel
        </Button>
        <p className="text-center text-xs text-muted">Login real usa o backend seguro conectado ao Neon.</p>
      </form>
    </AuthShell>
  );
};

export const RegisterPage = () => {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(RegisterSchema) });

  const onSubmit = async (values: RegisterInput) => {
    setMessage(null);
    try {
      const result = await api.register(values);
      setMessage({
        type: 'success',
        text: result.message
          ? result.message
          : result.requires_email_verification
          ? 'Conta criada. Verifique seu email antes de acessar o painel.'
          : 'Conta criada. Agora entre para escolher seu plano.',
      });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel criar a conta agora.',
      });
    }
  };

  return (
    <AuthShell title="Crie sua conta" subtitle="Cadastre o restaurante e receba o ambiente isolado automaticamente." active="register">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <UserRound className="h-4 w-4 text-neon" />
            Nome
          </span>
          <input className="form-field" autoComplete="name" {...register('fullName')} />
          <FieldError message={errors.fullName?.message} />
        </label>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Store className="h-4 w-4 text-neon" />
            Restaurante
          </span>
          <input className="form-field" {...register('restaurantName')} />
          <FieldError message={errors.restaurantName?.message} />
        </label>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Mail className="h-4 w-4 text-neon" />
            Email
          </span>
          <input className="form-field" type="email" autoComplete="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <LockKeyhole className="h-4 w-4 text-neon" />
              Senha
            </span>
            <input className="form-field" type="password" autoComplete="new-password" {...register('password')} />
            <FieldError message={errors.password?.message} />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">Confirmar senha</span>
            <input className="form-field" type="password" autoComplete="new-password" {...register('confirmPassword')} />
            <FieldError message={errors.confirmPassword?.message} />
          </label>
        </div>
        {message ? (
          <div
            className={`rounded-2xl border p-3 text-sm ${
              message.type === 'error'
                ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                : 'border-neon/30 bg-neon/10 text-sky-100'
            }`}
          >
            {message.text}
          </div>
        ) : null}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          Criar conta segura
        </Button>
        <p className="text-center text-sm text-muted">
          Já tem conta?{' '}
          <Link to="/login" className="font-bold text-neon hover:text-sky-200">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
};

export const ResetPasswordPage = () => {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(ResetPasswordSchema) });

  const onSubmit = async () => {
    setSent(true);
  };

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="A recuperacao de senha sera processada pelo suporte seguro do SIOU."
      active="reset"
    >
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Mail className="h-4 w-4 text-neon" />
            Email
          </span>
          <input className="form-field" type="email" autoComplete="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        {sent ? (
          <div className="rounded-2xl border border-neon/30 bg-neon/10 p-3 text-sm text-sky-100">
            Se o email existir, o suporte recebera sua solicitacao.
          </div>
        ) : null}
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          Enviar link seguro
        </Button>
      </form>
    </AuthShell>
  );
};

export const LegacyVerifyEmailPage = () => (
  <AuthShell
    title="Verifique seu email"
    subtitle="Para proteger o restaurante, o painel só é liberado após confirmação de email."
    active="verify"
  >
    <div className="rounded-2xl border border-neon/25 bg-neon/10 p-5 text-sm leading-7 text-sky-100">
      Abra o link de confirmação enviado para sua caixa de entrada. Depois disso, entre novamente no SIOU.
    </div>
    <Link to="/login" className="mt-5 inline-flex text-sm font-bold text-neon hover:text-sky-200">
      Voltar para login
    </Link>
  </AuthShell>
);

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const verificationStarted = useRef(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(Boolean(token));
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(ResetPasswordSchema) });

  useEffect(() => {
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;
    setIsVerifying(true);
    api
      .verifyEmail({ token })
      .then((result) => setMessage({ type: 'success', text: result.message }))
      .catch((error) =>
        setMessage({
          type: 'error',
          text: error instanceof Error ? error.message : 'Nao foi possivel confirmar seu email.',
        }),
      )
      .finally(() => setIsVerifying(false));
  }, [token]);

  const onSubmit = async (values: ResetPasswordInput) => {
    setMessage(null);
    try {
      const result = await api.resendVerification({ email: values.email });
      setMessage({ type: 'success', text: result.message });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Nao foi possivel reenviar agora.',
      });
    }
  };

  return (
    <AuthShell
      title="Verifique seu email"
      subtitle="Para proteger o restaurante, o painel so e liberado depois da confirmacao."
      active="verify"
    >
      <div className="rounded-2xl border border-neon/25 bg-neon/10 p-5 text-sm leading-7 text-sky-100">
        {token
          ? isVerifying
            ? 'Confirmando seu email...'
            : 'Depois da confirmacao, entre novamente no SIOU.'
          : 'Abra o link enviado para sua caixa de entrada. Depois disso, entre novamente no SIOU.'}
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Mail className="h-4 w-4 text-neon" />
            Email
          </span>
          <input className="form-field" type="email" autoComplete="email" {...register('email')} />
          <FieldError message={errors.email?.message} />
        </label>
        {message ? (
          <div
            className={`rounded-2xl border p-3 text-sm ${
              message.type === 'error'
                ? 'border-rose-400/30 bg-rose-500/10 text-rose-100'
                : 'border-neon/30 bg-neon/10 text-sky-100'
            }`}
          >
            {message.text}
          </div>
        ) : null}
        <Button className="w-full" type="submit" disabled={isSubmitting || isVerifying}>
          Reenviar email
        </Button>
      </form>

      <Link to="/login" className="mt-5 inline-flex text-sm font-bold text-neon hover:text-sky-200">
        Voltar para login
      </Link>
    </AuthShell>
  );
};
