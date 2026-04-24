import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Mail, MessageCircle, Phone, Send, UserRound, X } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';

interface SupportForm {
  name: string;
  email: string;
  phone: string;
  message: string;
}

type SupportErrors = Partial<Record<keyof SupportForm, string>>;

function normalizeNumber(value: string) {
  return value.replace(/[^\d]/g, '');
}

function validateForm(form: SupportForm): SupportErrors {
  const errors: SupportErrors = {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\+?[0-9\s()\-]{7,20}$/;

  if (!form.name.trim()) errors.name = 'Ingresa tu nombre completo.';
  if (!form.email.trim()) errors.email = 'Ingresa tu correo electronico.';
  else if (!emailRegex.test(form.email.trim())) errors.email = 'Ingresa un correo valido.';
  if (!form.phone.trim()) errors.phone = 'Ingresa tu telefono.';
  else if (!phoneRegex.test(form.phone.trim())) errors.phone = 'Ingresa un telefono valido.';
  if (!form.message.trim()) errors.message = 'Describe tu problema o duda.';
  else if (form.message.trim().length < 10) errors.message = 'Agrega un poco mas de detalle.';

  return errors;
}

export function WhatsAppFloatingButton() {
  const { token, user } = useAuth();
  const [number, setNumber] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [errors, setErrors] = useState<SupportErrors>({});
  const [form, setForm] = useState<SupportForm>({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    message: '',
  });

  useEffect(() => {
    if (!token || !user) return;
    fetch('/api/support/whatsapp', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : null)
      .then(data => setNumber(data?.number || ''))
      .catch(() => {});
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    setForm(prev => ({
      ...prev,
      name: prev.name || user.name || '',
      email: prev.email || user.email || '',
    }));
  }, [user]);

  const whatsappHref = useMemo(() => {
    const cleanNumber = normalizeNumber(number);
    const text = encodeURIComponent(`Hola, soy ${form.name.trim()}. Mi correo es ${form.email.trim()}. Necesito ayuda con: ${form.message.trim()}.`);
    return cleanNumber ? `https://wa.me/${cleanNumber}?text=${text}` : '';
  }, [form.email, form.message, form.name, number]);

  if (!user) return null;

  const updateField = (field: keyof SupportForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
    setFormError('');
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    setSuccessMessage('');
    setFormError('');
    setErrors({});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setFormError('');

    if (Object.keys(nextErrors).length > 0) return;
    if (!token) {
      setFormError('Tu sesion expiro. Inicia sesion nuevamente.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          message: form.message.trim(),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.fields) {
          setErrors({
            name: data.fields.name?.[0],
            email: data.fields.email?.[0],
            phone: data.fields.phone?.[0],
            message: data.fields.message?.[0],
          });
        }
        throw new Error(data.error || 'No se pudo enviar el ticket.');
      }

      setSuccessMessage(data.message || 'Tu solicitud fue enviada correctamente. Un administrador se pondra en contacto contigo.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Error de conexion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-50 w-14 h-14 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-900/20 flex items-center justify-center hover:bg-emerald-600 focus:outline-none focus:ring-4 focus:ring-emerald-200"
        aria-label="Abrir soporte por WhatsApp"
        title="Soporte"
      >
        <MessageCircle className="w-7 h-7" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Soporte WhatsApp
                </div>
                <h2 className="text-xl font-extrabold text-slate-900">Crear ticket de soporte</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Registra tu solicitud y luego podras continuar la conversacion por WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="ui-modal-close flex items-center justify-center shrink-0"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5">
              {successMessage ? (
                <div className="space-y-5">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                      <p className="text-sm font-bold text-emerald-800">{successMessage}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Resumen</p>
                    <p className="text-sm text-slate-700">
                      Hola, soy <strong>{form.name.trim()}</strong>. Mi correo es <strong>{form.email.trim()}</strong>. Necesito ayuda con: {form.message.trim()}.
                    </p>
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={closeModal} className="ui-btn ui-btn-secondary px-5 py-2.5">
                      Cerrar
                    </button>
                    {whatsappHref && (
                      <a href={whatsappHref} target="_blank" rel="noreferrer" className="ui-btn bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600 px-5 py-2.5">
                        <ExternalLink className="w-4 h-4" />
                        Abrir WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="ui-label flex items-center gap-2"><UserRound className="w-4 h-4" /> Nombre completo</span>
                      <input
                        value={form.name}
                        onChange={event => updateField('name', event.target.value)}
                        className={`ui-input ${errors.name ? 'border-red-300 focus:border-red-500' : ''}`}
                        placeholder="Tu nombre"
                      />
                      {errors.name && <p className="mt-1 text-xs font-semibold text-red-600">{errors.name}</p>}
                    </label>

                    <label className="block">
                      <span className="ui-label flex items-center gap-2"><Phone className="w-4 h-4" /> Telefono</span>
                      <input
                        value={form.phone}
                        onChange={event => updateField('phone', event.target.value)}
                        className={`ui-input ${errors.phone ? 'border-red-300 focus:border-red-500' : ''}`}
                        placeholder="+593 99 999 9999"
                      />
                      {errors.phone && <p className="mt-1 text-xs font-semibold text-red-600">{errors.phone}</p>}
                    </label>
                  </div>

                  <label className="block">
                    <span className="ui-label flex items-center gap-2"><Mail className="w-4 h-4" /> Correo electronico</span>
                    <input
                      value={form.email}
                      onChange={event => updateField('email', event.target.value)}
                      className={`ui-input ${errors.email ? 'border-red-300 focus:border-red-500' : ''}`}
                      placeholder="correo@ejemplo.com"
                    />
                    {errors.email && <p className="mt-1 text-xs font-semibold text-red-600">{errors.email}</p>}
                  </label>

                  <label className="block">
                    <span className="ui-label">Problema o duda</span>
                    <textarea
                      value={form.message}
                      onChange={event => updateField('message', event.target.value)}
                      className={`ui-input min-h-32 resize-y ${errors.message ? 'border-red-300 focus:border-red-500' : ''}`}
                      placeholder="Describe en detalle en que necesitas ayuda..."
                    />
                    {errors.message && <p className="mt-1 text-xs font-semibold text-red-600">{errors.message}</p>}
                  </label>

                  {formError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      {formError}
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                    <button type="button" onClick={closeModal} className="ui-btn ui-btn-secondary px-5 py-2.5" disabled={isSubmitting}>
                      Cancelar
                    </button>
                    <button type="submit" className="ui-btn ui-btn-primary px-5 py-2.5" disabled={isSubmitting}>
                      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Enviar ticket
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
