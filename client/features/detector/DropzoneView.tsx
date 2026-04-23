import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { ORIGINAL_UPLOAD_MAX_BYTES, ORIGINAL_UPLOAD_MAX_MB } from '@shared/constants/ticketRules';

interface DropzoneViewProps {
  onFileAccepted: (file: File) => void;
}

export function DropzoneView({ onFileAccepted }: DropzoneViewProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    setError(null);
    if (fileRejections.length > 0) {
      const code = fileRejections[0]?.errors?.[0]?.code;
      if (code === 'file-too-large') {
        setError(`El archivo excede el limite de ${ORIGINAL_UPLOAD_MAX_MB}MB. Intenta con un archivo mas pequeno.`);
      } else {
        setError('Formato no valido. Solo se aceptan archivos .pdf, .doc y .docx.');
      }
      return;
    }
    if (acceptedFiles.length > 0) {
      onFileAccepted(acceptedFiles[0]);
    }
  }, [onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc']
    },
    maxSize: ORIGINAL_UPLOAD_MAX_BYTES,
    maxFiles: 1
  } as any);

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        id="file-dropzone"
        className={`ui-upload-tile relative group p-8 md:p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-all duration-300 ${
          isDragActive
            ? 'border-blue-500 bg-blue-50/60 scale-[1.02]'
            : ''
        }`}
      >
        <input {...getInputProps()} id="file-input" />

        <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${
          isDragActive ? 'bg-blue-500 text-white scale-110' : 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600'
        }`}>
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {isDragActive && (
            <div className="absolute inset-0 rounded-2xl animate-pulse-ring bg-blue-400/30" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-1">
            {isDragActive ? 'Suelta el archivo aqui.' : 'Arrastra aqui tu documento'}
          </h2>
          <p className="text-sm text-slate-400">
            o haz clic para explorar en tus archivos
          </p>
        </div>

        <button
          id="select-file-btn"
          className="ui-btn ui-btn-primary mt-1 text-sm px-6 py-2.5 pointer-events-none"
        >
          Seleccionar archivo
        </button>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          {['.pdf', '.doc', '.docx'].map((fmt) => (
            <span key={fmt} className="text-[11px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100 uppercase">
              {fmt}
            </span>
          ))}
          <span className="text-[11px] text-slate-300 ml-1">Max. {ORIGINAL_UPLOAD_MAX_MB}MB</span>
        </div>
      </div>

      {error && (
        <div className="ui-toast ui-toast-error mt-4 flex items-center gap-2 animate-fade-in-up">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-red-600 text-sm font-semibold">{error}</p>
        </div>
      )}
    </div>
  );
}
