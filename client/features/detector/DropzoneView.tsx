import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { AlertCircle, FileUp } from 'lucide-react';
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

        <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
          isDragActive ? 'bg-blue-600 text-white scale-105' : 'bg-blue-50 text-blue-600 border border-blue-100'
        }`}>
          <FileUp className="w-7 h-7" />
          {isDragActive && (
            <div className="absolute inset-0 rounded-2xl animate-pulse-ring bg-blue-400/30" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-1">
            {isDragActive ? 'Suelta el archivo aquí.' : 'Arrastra aquí tu documento'}
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
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-red-600 text-sm font-semibold">{error}</p>
        </div>
      )}
    </div>
  );
}
