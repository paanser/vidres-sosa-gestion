"use strict";
(() => {
 const dialog=document.querySelector("#editor"), form=document.querySelector("#form");
 const panel=document.querySelector("#voice-panel"), button=document.querySelector("#voice-start"), stop=document.querySelector("#voice-stop"), apply=document.querySelector("#voice-apply"), transcript=document.querySelector("#voice-transcript"), message=document.querySelector("#voice-message");
 const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 let recognition=null, listening=false, base="";
 const fields=["cliente","descripcion","direccion","responsable","fecha","estado","notas"];
 const setMessage=(s)=>{message.textContent=s;};
 function extract(text){
   const aliases={cliente:"cliente|nombre(?: del cliente)?",descripcion:"(?:descripci[oó]n|trabajo|tarea|hay que|hacer)",direccion:"direcci[oó]n|domicilio|ubicaci[oó]n",responsable:"responsable|operario|t[eé]cnico",fecha:"fecha(?: prevista)?|para el d[ií]a|para el",estado:"estado",notas:"notas|observaciones|comentarios"};
   const keys=Object.keys(aliases);
   const pattern=new RegExp("(?:^|[.,;\\n]\\s*|\\s+)(?:"+keys.map(k=>"("+aliases[k]+")").join("|")+")\\s*(?::|,|es|ser[aá])?\\s*","gi");
   const matches=[...text.matchAll(pattern)];const result={};
   for(let i=0;i<matches.length;i++){
     const m=matches[i],key=keys.find((k,j)=>m[j+1]!==undefined);
     const value=text.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:text.length).trim().replace(/^[,.;:\s]+|[,.;:\s]+$/g,"");
     if(key&&value)result[key]=value;
   }
   // Never infer an unspecified client, address or measurement.
   if(!matches.length && text.trim())result.descripcion=text.trim();
   if(result.estado){const s=result.estado.toLowerCase();const options=[...form.elements.estado.options].map(o=>o.value);result.estado=options.find(v=>v.toLowerCase()===s)||options.find(v=>s.includes(v.toLowerCase()))||"";}
   if(result.fecha){const v=result.fecha.trim();const iso=/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;const es=v.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);result.fecha=iso||(es?es[3]+"-"+es[2].padStart(2,"0")+"-"+es[1].padStart(2,"0"):"");}
   return result;
 }
 function stopListening(){if(recognition&&listening){recognition.stop();}listening=false;button.disabled=false;stop.disabled=true;}
 button.addEventListener("click",()=>{
   if(!Recognition){setMessage("El reconocimiento automático no está disponible en este navegador. Puedes usar el micrófono del teclado del iPhone en el cuadro de texto.");transcript.focus();return;}
   base=transcript.value.trim();recognition=new Recognition();recognition.lang="es-ES";recognition.continuous=true;recognition.interimResults=true;
   recognition.onresult=(event)=>{let final="",interim="";for(let i=event.resultIndex;i<event.results.length;i++){const phrase=event.results[i][0].transcript;if(event.results[i].isFinal)final+=phrase+" ";else interim+=phrase;}if(final)base=(base+" "+final).trim();transcript.value=(base+" "+interim).trim();};
   recognition.onerror=(event)=>{setMessage(event.error==="not-allowed"?"Permiso de micrófono denegado. Actívalo en los ajustes del navegador.":"No se ha podido reconocer la voz ("+event.error+"). Usa el micrófono del teclado si lo prefieres.");stopListening();};
   recognition.onend=()=>{listening=false;button.disabled=false;stop.disabled=true;};
   try{recognition.start();listening=true;button.disabled=true;stop.disabled=false;setMessage("Escuchando… Pulsa Detener al terminar. Nada se guardará automáticamente.");}catch{setMessage("No se pudo iniciar el micrófono. Prueba con el dictado del teclado.");}
 });
 stop.addEventListener("click",stopListening);
 apply.addEventListener("click",()=>{
   stopListening();const text=transcript.value.trim();if(!text){setMessage("Primero dicta o escribe el parte.");return;}
   const values=extract(text);let count=0;
   for(const k of fields){if(values[k] && form.elements[k]){form.elements[k].value=values[k].slice(0,form.elements[k].maxLength>0?form.elements[k].maxLength:1000);count++;}}
   if(!values.notas && !values.descripcion && text){form.elements.notas.value=text.slice(0,1000);}
   setMessage("Se han rellenado "+count+" campos. Revisa especialmente cliente, fecha, dirección y medidas antes de pulsar Guardar.");
   form.elements.cliente.focus();
 });
 dialog.addEventListener("close",()=>{stopListening();transcript.value="";setMessage("Di, por ejemplo: cliente Ana, trabajo cambiar cristal, dirección calle Mayor 15, responsable Pau, notas llamar antes.");});
})();