"use strict";
(() => {
  const instances = new WeakMap();
  const colors = ["#17251e", "#b42318", "#2457a7", "#15523e"];
  const limit = 5000;
  function clean(value) {
    const pageHeight=Number.isFinite(value?.pageHeight)?Math.max(400,Math.min(2400,Math.round(value.pageHeight))):700;
    let count = 0;
    const strokes = [];
    for (const stroke of Array.isArray(value?.strokes) ? value.strokes : []) {
      if (count >= limit) break;
      const points = (Array.isArray(stroke.points) ? stroke.points : []).slice(0, limit - count)
        .filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        .map(([x,y]) => [Math.max(0,Math.min(1000,x)), Math.max(0,Math.min(pageHeight,y))]);
      count += points.length;
      if (points.length) {
        const tool=stroke.tool==="eraser"?"eraser":"pen";
        const allowed=tool==="eraser"?[24,48,80]:[3,6,10];
        strokes.push({color:colors.includes(stroke.color)?stroke.color:colors[0],tool,width:allowed.includes(stroke.width)?stroke.width:allowed[0],points});
      }
    }
    return {pageHeight,strokes,notes:typeof value?.notes === "string" ? value.notes.slice(0,1000) : ""};
  }
  // Ajustes geométricos locales: no interpretan cifras ni cambian medidas.
  function straighten(points) {
    if(points.length<3)return null;
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const first=points[0],last=points.at(-1),span=distance(first,last);
    const length=points.slice(1).reduce((n,p,i)=>n+distance(points[i],p),0);
    if(span>=20&&length<=span*1.18){
      const deviation=Math.max(...points.map(p=>Math.abs((last[0]-first[0])*(first[1]-p[1])-(first[0]-p[0])*(last[1]-first[1]))/span));
      if(deviation<=Math.max(4,span*.08)){
        let end=[...last];
        if(Math.abs(last[1]-first[1])<=span*.12)end[1]=first[1];
        else if(Math.abs(last[0]-first[0])<=span*.12)end[0]=first[0];
        return {points:[first,end],label:"Línea enderezada"};
      }
    }
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
    if(points.length<8||w<20||h<20||span>Math.hypot(w,h)*.2||length<2*(w+h)*.75||length>2*(w+h)*1.4)return null;
    const tolerance=Math.max(5,Math.min(w,h)*.12),corners=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
    if(!corners.every(c=>points.some(p=>distance(c,p)<=tolerance*1.4)))return null;
    if(points.filter(p=>Math.min(Math.abs(p[0]-x),Math.abs(p[0]-x-w),Math.abs(p[1]-y),Math.abs(p[1]-y-h))<=tolerance).length<points.length*.9)return null;
    // Mantener orientación y dimensiones aproximadas del dibujo original.
    return {points:[...corners,corners[0]],label:"Rectángulo ajustado"};
  }
  function smooth(points) {
    if(points.length<5)return null;
    return points.map((p,i)=>{
      if(i===0||i===points.length-1)return [...p];
      return [0,1].map(axis=>Math.round((points[i-1][axis]+2*p[axis]+points[i+1][axis])/4));
    });
  }
  function mount(host, initial, options={}) {
    instances.get(host)?.destroy();
    host.replaceChildren();
    const details = document.createElement("details");
    details.className = "sketch-book";
    details.innerHTML = `<summary>✎ Dibujar medidas · Bloc de croquis</summary><div class="sketch-editor">
      <p>Dibuja medidas y formas con el dedo, lápiz táctil o ratón. Se guarda al guardar la pieza.</p>
      <div class="sketch-tools sketch-case" role="group" aria-label="Estuche de dibujo">
        <button type="button" data-case-toggle aria-expanded="false">✎ Estuche</button>
        <span data-case-state>Lápiz negro · fino</span>
        <div class="sketch-case-panel" hidden>
        <button type="button" data-ink="#17251e" aria-pressed="true">Negro</button>
        <button type="button" data-ink="#b42318" aria-pressed="false">Rojo</button>
        <button type="button" data-ink="#2457a7" aria-pressed="false">Azul</button>
        <button type="button" data-ink="#15523e" aria-pressed="false">Verde</button>
        <button type="button" data-sketch-eraser aria-pressed="false">Goma</button>
        <label>Grosor del lápiz<select data-sketch-width><option value="3">Fino</option><option value="6">Medio</option><option value="10">Grueso</option></select></label>
        <label>Tamaño de goma<select data-eraser-width><option value="24">Pequeña</option><option value="48" selected>Mediana</option><option value="80">Grande</option></select></label>
        <button type="button" data-sketch-notes>Notas escritas</button><button type="button" data-sketch-expand>Abrir pantalla del bloc</button>
        <button type="button" data-sketch-undo>Deshacer</button>
        <button type="button" data-sketch-redo>Rehacer</button>
        <button type="button" data-sketch-clear>Borrar dibujo</button>
        </div>
      </div>
      <p>Mejora automática al levantar el dedo o lápiz: endereza líneas, ajusta rectángulos y suaviza los demás trazos. Dibuja el contorno de una vez. Deshacer recupera el trazo original. No interpreta letras ni medidas.</p>
      <div class="sketch-sheet"><canvas width="1000" height="700" aria-label="Hoja de croquis: dibuja con el dedo, lápiz o ratón"></canvas></div>
      <label class="sketch-note" hidden>Notas del croquis<textarea maxlength="1000" rows="3" placeholder="Medidas, detalles de montaje o indicaciones…"></textarea></label>
      <p class="sketch-message" role="status" aria-live="polite"></p></div>`;
    const editor=details.querySelector(".sketch-editor");editor.classList.add("sketch-book");
    host.appendChild(details);
    const preview=document.createElement("div");preview.className="sketch-preview";preview.hidden=true;
    preview.innerHTML='<button type="button" aria-label="Abrir el croquis guardado"><img alt="Vista previa de la hoja de medidas"></button><p></p>';
    host.appendChild(preview);
    const expanded=document.createElement("dialog");
    expanded.className="sketch-expanded";
    const titleId="sketch-title-"+crypto.randomUUID();
    expanded.setAttribute("aria-labelledby",titleId);
    expanded.innerHTML=`<div class="sketch-expanded-header"><h2 id="${titleId}">Bloc de medidas</h2><button type="button" data-sketch-return>Aceptar</button><button type="button" data-sketch-cancel>Cancelar</button></div><div class="sketch-expanded-content"></div>`;
    host.appendChild(expanded);
    function enlarge(){
      if(expanded.open)return;
      details.open=true;
      expanded.querySelector(".sketch-expanded-content").appendChild(editor);
      expanded.showModal();requestAnimationFrame(fitSheet);
    }
    preview.querySelector("button").addEventListener("click",enlarge);
    expanded.querySelector("[data-sketch-return]").addEventListener("click",()=>{
      if(pointer!==null)return;
      try{
        const result=read();options.onAccept?.(result);
        accepted=structuredClone(result);updatePreview();expanded.close();
      }catch{message.textContent="No se pudo guardar el croquis. Conserva esta pantalla e inténtalo de nuevo.";alert(message.textContent);}
    });
    function cancel(){
      if(JSON.stringify({strokes:state.strokes,notes:notes.value.trim()})!==JSON.stringify({strokes:accepted.strokes,notes:accepted.notes})&&!confirm("Hay cambios sin aceptar. ¿Descartarlos y volver al parte?"))return;
      state=clean(accepted);notes.value=state.notes;history=[];future=[];redraw();expanded.close();
    }
    expanded.querySelector("[data-sketch-cancel]").addEventListener("click",cancel);
    expanded.addEventListener("cancel",e=>{e.preventDefault();cancel();});
    expanded.addEventListener("close",()=>{
      closeCase();editor.querySelector(".sketch-note").hidden=true;details.open=false;
      if(editor.parentNode===expanded.querySelector(".sketch-expanded-content"))details.appendChild(editor);
      if(active){active=null;pointer=null;redraw();}
    });
    details.querySelector("summary").addEventListener("click",e=>{e.preventDefault();enlarge();});
    let state=clean(initial),accepted=clean(initial),ink=colors[0],active=null,pointer=null,history=[],future=[],tool="pen";
    const canvas=editor.querySelector("canvas"),ctx=canvas.getContext("2d"),notes=editor.querySelector("textarea"),message=editor.querySelector(".sketch-message");
    const casePanel=editor.querySelector(".sketch-case-panel"),caseToggle=editor.querySelector("[data-case-toggle]");
    casePanel.id="sketch-case-"+crypto.randomUUID();caseToggle.setAttribute("aria-controls",casePanel.id);
    function closeCase(){casePanel.hidden=true;caseToggle.setAttribute("aria-expanded","false");}
    function toolStatus(){
      const name={"#17251e":"negro","#b42318":"rojo","#2457a7":"azul","#15523e":"verde"}[ink];
      const size=editor.querySelector(tool==="eraser"?"[data-eraser-width]":"[data-sketch-width]");
      editor.querySelector("[data-case-state]").textContent=(tool==="eraser"?"Goma": "Lápiz "+name)+" · "+size.selectedOptions[0].text.toLocaleLowerCase("es");
    }
    editor.addEventListener("change",e=>{if(e.target.matches("[data-sketch-width],[data-eraser-width]"))toolStatus();});
    function read(){return structuredClone({pageHeight:state.pageHeight,strokes:state.strokes,notes:notes.value.trim()});}
    function updatePreview(){
      const page=document.createElement("canvas");page.width=320;page.height=Math.round(320*state.pageHeight/1000);
      const pc=page.getContext("2d");pc.fillStyle="#fff";pc.fillRect(0,0,page.width,page.height);pc.drawImage(canvas,0,0,page.width,page.height);
      preview.querySelector("img").src=page.toDataURL("image/png");preview.hidden=!state.strokes.length&&!notes.value.trim();
      preview.querySelector("p").textContent=options.onAccept?"Croquis guardado en la pieza.":"Croquis aceptado. Guarda el parte o la pieza para conservarlo.";
      details.querySelector("summary").textContent="✎ Abrir pantalla del bloc";
    }
    function fitSheet(){
      if(!expanded.open)return;
      const sheet=editor.querySelector(".sketch-sheet"),r=sheet.getBoundingClientRect();if(r.width<=0||r.height<=0)return;
      const target=Math.max(400,Math.min(2400,Math.round(r.height*1000/r.width)));
      state.pageHeight=state.strokes.length?Math.max(state.pageHeight,target):target;
      canvas.height=state.pageHeight;
      const scale=Math.min(r.width/1000,r.height/state.pageHeight);
      canvas.style.width=(1000*scale)+"px";canvas.style.height=(state.pageHeight*scale)+"px";
      redraw();
    }
    const observer=new ResizeObserver(fitSheet);observer.observe(editor.querySelector(".sketch-sheet"));
    notes.value=state.notes;
    if(state.strokes.length||state.notes)details.querySelector("summary").textContent="✎ Dibujar medidas · Con anotaciones";
    function draw(stroke) {
      ctx.save();
      ctx.globalCompositeOperation=stroke.tool==="eraser"?"destination-out":"source-over";
      ctx.strokeStyle=ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width||(stroke.tool==="eraser"?24:3);ctx.lineCap=ctx.lineJoin="round";
      const [first,...rest]=stroke.points;
      if (!first){ctx.restore();return;}
      if (!rest.length) {ctx.beginPath();ctx.arc(first[0],first[1],ctx.lineWidth/2,0,Math.PI*2);ctx.fill();ctx.restore();return;}
      ctx.beginPath();ctx.moveTo(...first);for(const p of rest)ctx.lineTo(...p);ctx.stroke();ctx.restore();
    }
    function remember(){future=[];history.push(structuredClone(state.strokes));if(history.length>20)history.shift();}
    function redraw(){if(canvas.height!==state.pageHeight)canvas.height=state.pageHeight;ctx.clearRect(0,0,1000,state.pageHeight);state.strokes.forEach(draw);if(active)draw(active);editor.querySelector("[data-sketch-undo]").disabled=!state.strokes.length&&!history.length;editor.querySelector("[data-sketch-clear]").disabled=!state.strokes.length;editor.querySelector("[data-sketch-redo]").disabled=!future.length;}
    const point=e=>{const r=canvas.getBoundingClientRect();return [Math.round(Math.max(0,Math.min(1000,(e.clientX-r.left)*1000/r.width))),Math.round(Math.max(0,Math.min(state.pageHeight,(e.clientY-r.top)*state.pageHeight/r.height)))];};
    const count=()=>state.strokes.reduce((n,s)=>n+s.points.length,0)+(active?.points.length||0);
    canvas.addEventListener("pointerdown",e=>{
      if(pointer!==null||!e.isPrimary||e.button!==0)return;
      if(count()>=limit){message.textContent="Hoja llena. Deshaz algún trazo antes de seguir dibujando.";return;}
      closeCase();e.preventDefault();pointer=e.pointerId;active={color:ink,tool,width:Number(editor.querySelector(tool==="eraser"?"[data-eraser-width]":"[data-sketch-width]").value),points:[point(e)]};canvas.setPointerCapture(pointer);redraw();
    });
    canvas.addEventListener("pointermove",e=>{
      if(e.pointerId!==pointer||!active)return;e.preventDefault();
      const p=point(e),last=active.points.at(-1);
      if(count()<limit&&(p[0]!==last[0]||p[1]!==last[1])){active.points.push(p);redraw();}
      if(count()>=limit)message.textContent="Hoja llena. Puedes guardar o deshacer trazos.";
    });
    function finish(e){
      if(e.pointerId!==pointer)return;
      if(e.type==="pointerup"&&active){
        const end=point(e),last=active.points.at(-1);
        if(count()<limit&&(end[0]!==last[0]||end[1]!==last[1]))active.points.push(end);
        remember();state.strokes.push(active);
        const assisted=active.tool==="pen"?straighten(active.points):null,points=active.tool==="pen"?(assisted?.points||smooth(active.points)):null;
        if(points&&JSON.stringify(points)!==JSON.stringify(active.points)){
          // Deshacer primero restaura el trazo original, después permite quitarlo.
          remember();state.strokes[state.strokes.length-1]={...active,points};
          message.textContent=(assisted?.label||"Trazo suavizado automáticamente")+". Deshacer recupera el original.";
        }else message.textContent=active.tool==="eraser"?"Zona borrada. Puedes deshacer.":"Trazo conservado.";
      }
      active=null;pointer=null;redraw();
    }
    canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);canvas.addEventListener("lostpointercapture",finish);
    editor.addEventListener("click",e=>{
      const b=e.target.closest("button");if(!b)return;
      if(b.hasAttribute("data-case-toggle")){casePanel.hidden=!casePanel.hidden;caseToggle.setAttribute("aria-expanded",String(!casePanel.hidden));return;}
      if(b.hasAttribute("data-sketch-notes")){const note=editor.querySelector(".sketch-note");note.hidden=!note.hidden;closeCase();if(!note.hidden)notes.focus();return;}
      if(b.hasAttribute("data-sketch-expand")){enlarge();return;}
      if(b.dataset.ink||b.hasAttribute("data-sketch-eraser")){
        tool=b.hasAttribute("data-sketch-eraser")?"eraser":"pen";
        if(b.dataset.ink)ink=b.dataset.ink;
        editor.querySelectorAll("[data-ink]").forEach(x=>x.setAttribute("aria-pressed",String(tool==="pen"&&x.dataset.ink===ink)));
        editor.querySelector("[data-sketch-eraser]").setAttribute("aria-pressed",String(tool==="eraser"));
        canvas.classList.toggle("is-erasing",tool==="eraser");toolStatus();
        message.textContent=tool==="eraser"?"Goma activa: pasa por la zona que quieras borrar.":"Lápiz activo.";
      }
      if(b.hasAttribute("data-sketch-undo")){
        future.push(structuredClone(state.strokes));if(future.length>20)future.shift();
        if(history.length)state.strokes=history.pop();else state.strokes.pop();
        message.textContent="Última acción deshecha.";redraw();
      }
      if(b.hasAttribute("data-sketch-redo")&&future.length){history.push(structuredClone(state.strokes));if(history.length>20)history.shift();state.strokes=future.pop();message.textContent="Última acción rehecha.";redraw();}
      if(b.hasAttribute("data-sketch-clear")&&confirm("¿Borrar todos los trazos de este croquis? Las notas se conservarán.")){remember();state.strokes=[];message.textContent="Dibujo borrado. Guarda la pieza para confirmar el cambio.";redraw();}
    });
    redraw();if(state.strokes.length||state.notes)updatePreview();
    const instance={
      read,
      open:enlarge,
      close(){if(expanded.open)expanded.close();},
      destroy(){observer.disconnect();if(expanded.open)expanded.close();}
    };
    instances.set(host,instance);return instance;
  }
  window.vidresSketch={mount,destroy:host=>instances.get(host)?.destroy(),open:host=>instances.get(host)?.open(),read:host=>instances.get(host)?.read()||{strokes:[],notes:""}};
})();
