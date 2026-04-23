import React, { useState } from 'react';

export function HumanizerLayout() {
  const [textLength, setTextLength] = useState(0);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 w-full max-w-5xl mx-auto">
      <div className="text-center mb-8 max-w-2xl w-full">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-3xl font-bold text-slate-800">Humanizador de Textos</h1>
          <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">BETA</span>
        </div>
        <p className="text-slate-500 font-medium">
          Refina y adapta el tono de tus textos generados por IA.
        </p>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="col-span-1 lg:col-span-8">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 p-6 flex flex-col h-full min-h-[500px]">
            <div className="flex justify-between items-center mb-4">
              <label className="text-sm font-bold text-slate-600 uppercase tracking-wider" htmlFor="ai-input">Texto Recibido (IA)</label>
              <div className="flex items-center gap-2 text-slate-400">
                <button className="p-2 hover:bg-slate-50 rounded-xl transition-colors hover:text-blue-600" title="Pegar">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                </button>
                <button className="p-2 hover:bg-slate-50 rounded-xl transition-colors hover:text-red-500" title="Borrar">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>
            </div>
            <textarea 
              id="ai-input" 
              className="w-full flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-slate-700 placeholder:text-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none transition-all" 
              placeholder="Pega el texto generado por IA aquí..."
              onChange={(e) => setTextLength(e.target.value.split(/\s+/).filter(w => w.length > 0).length)}
            ></textarea>
            <div className="flex justify-end mt-4">
              <span className="text-xs font-semibold text-slate-400">{textLength} palabras</span>
            </div>
          </div>
        </div>

        <div className="col-span-1 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 p-6 flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                 <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                 Tono Objetivo
              </h3>
              <div className="flex flex-col gap-3">
                <label className="relative flex items-center p-3 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50 group">
                  <input type="radio" name="tone" value="universitario" className="sr-only peer" defaultChecked />
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-has-[:checked]:bg-blue-100 group-has-[:checked]:text-blue-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z"></path><path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"></path></svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">Universitario</span>
                      <span className="text-[11px] font-medium text-slate-400">Formal y estructurado</span>
                    </div>
                  </div>
                  <div className="absolute right-4 w-4 h-4 rounded-full border-2 border-slate-200 hidden peer-checked:block bg-blue-600 border-blue-600 shadow-[0_0_0_2px_white_inset]"></div>
                </label>

                <label className="relative flex items-center p-3 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50 group">
                  <input type="radio" name="tone" value="profesional" className="sr-only peer" />
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-has-[:checked]:bg-blue-100 group-has-[:checked]:text-blue-600 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">Profesional</span>
                      <span className="text-[11px] font-medium text-slate-400">Directo y corporativo</span>
                    </div>
                  </div>
                  <div className="absolute right-4 w-4 h-4 rounded-full border-2 border-slate-200 hidden peer-checked:block bg-blue-600 border-blue-600 shadow-[0_0_0_2px_white_inset]"></div>
                </label>

                <label className="relative flex items-center p-3 border border-slate-100 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/50 group">
                  <input type="radio" name="tone" value="creativo" className="sr-only peer" />
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center group-has-[:checked]:bg-blue-100 group-has-[:checked]:text-blue-600 transition-colors">
                       <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">Creativo</span>
                      <span className="text-[11px] font-medium text-slate-400">Fluido y dinámico</span>
                    </div>
                  </div>
                  <div className="absolute right-4 w-4 h-4 rounded-full border-2 border-slate-200 hidden peer-checked:block bg-blue-600 border-blue-600 shadow-[0_0_0_2px_white_inset]"></div>
                </label>
              </div>
            </div>

            <hr className="border-slate-100" />

            <div className="flex flex-col opacity-50 relative group">
              <div className="absolute inset-0 z-10" title="Próximamente"></div>
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                Ajustes Avanzados
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500">Preservar citas textuales</span>
                <div className="w-10 h-6 bg-slate-200 rounded-full relative">
                  <div className="w-4 h-4 bg-white rounded-full absolute left-1 top-1 shadow-sm"></div>
                </div>
              </div>
            </div>

          </div>

          <div className="relative pt-2">
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-3 py-1 rounded-full text-[10px] font-bold shadow-md z-10 uppercase tracking-widest flex items-center gap-1">
              Próximamente
            </div>
            <button disabled className="w-full py-4 rounded-2xl bg-slate-50 text-slate-400 font-bold flex justify-center items-center gap-2 cursor-not-allowed border-2 border-slate-100 transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
              Humanizar Texto
            </button>
            <p className="text-center mt-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Afirmando modelos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
