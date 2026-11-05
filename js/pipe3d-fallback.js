(() => {
  const viewer = document.querySelector('#pipeSvgFallback');
  const canvasView = document.querySelector('#pipe3dViewer');
  const hint = document.querySelector('.pipe-drag-hint');
  const buttons = [...document.querySelectorAll('[data-pipe-view]')];
  const resetButton = document.querySelector('#resetPipeView');
  if (!viewer || !canvasView) return;

  let mode = '3d';
  let drag = null;

  function actualSceneReady() { return Boolean(window.flowguardPipe3D?.ready); }
  function setButtons(next) {
    buttons.forEach(button => {
      const active = button.dataset.pipeView === next;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function setMode(next, reset = false, force = false) {
    if (actualSceneReady() && !force) return;
    mode = next;
    viewer.style.display = 'block';
    canvasView.style.display = 'none';
    viewer.classList.toggle('pseudo-3d', next === '3d');
    viewer.classList.toggle('view-2d', next === '2d');
    if (reset || next === '2d') viewer.style.setProperty('--tilt-x', next === '2d' ? '0deg' : '48deg');
    if (reset || next === '2d') viewer.style.setProperty('--tilt-y', '0deg');
    viewer.style.setProperty('--tilt-z', next === '2d' ? '0deg' : '-7deg');
    setButtons(next);
    if (hint) hint.innerHTML = next === '3d' ? '<i class="bi bi-arrows-move"></i> Drag to rotate' : '<i class="bi bi-arrows-move"></i> Drag to pan';
  }
  buttons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.pipeView, true)));
  resetButton?.addEventListener('click', () => setMode('3d', true));

  viewer.addEventListener('pointerdown', event => {
    if (actualSceneReady() || mode !== '3d') return;
    drag = { x: event.clientX, y: event.clientY, rx: parseFloat(viewer.style.getPropertyValue('--tilt-x')) || 48, ry: parseFloat(viewer.style.getPropertyValue('--tilt-y')) || 0 };
    viewer.setPointerCapture?.(event.pointerId);
    viewer.classList.add('is-dragging');
  });
  viewer.addEventListener('pointermove', event => {
    if (!drag || actualSceneReady()) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    viewer.style.setProperty('--tilt-x', `${Math.max(24, Math.min(68, drag.rx - dy * .22))}deg`);
    viewer.style.setProperty('--tilt-y', `${Math.max(-28, Math.min(28, drag.ry + dx * .2))}deg`);
  });
  const endDrag = () => { drag = null; viewer.classList.remove('is-dragging'); };
  viewer.addEventListener('pointerup', endDrag);
  viewer.addEventListener('pointercancel', endDrag);
  viewer.addEventListener('lostpointercapture', endDrag);

  window.flowguardPipeFallback = { setMode, setModeFromScene(next) { setMode(next, true, true); }, deactivate() { viewer.classList.remove('pseudo-3d', 'is-dragging'); viewer.style.removeProperty('transform'); } };
  const demoDrains={
    'demo-001':{code:'D-001',location:'Riverside Road',status:'Normal',water:'32%',flow:'76%',debris:'Clear'},
    'demo-002':{code:'D-002',location:'Market Street',status:'Warning',water:'67%',flow:'54%',debris:'Clear'},
    'demo-003':{code:'D-003',location:'School Lane',status:'Normal',water:'28%',flow:'81%',debris:'Clear'},
    'demo-004':{code:'D-004',location:'Main Street',status:'Critical',water:'88%',flow:'18%',debris:'Detected'},
    'demo-005':{code:'D-005',location:'Creekside Path',status:'Offline',water:'45%',flow:'62%',debris:'Clear'}
  };
  document.querySelector('#drainMap')?.addEventListener('click',event=>{
    if(window.flowguardDashboardReady)return;
    const marker=event.target.closest('[data-drain-id]');const drain=marker&&demoDrains[marker.dataset.drainId];if(!drain)return;
    document.querySelector('#drainDetailsTitle').textContent=`${drain.code} · ${drain.location}`;
    document.querySelector('#drainDetailsBody').innerHTML=`<dl class="profile-details"><div><dt>Status</dt><dd>${drain.status}</dd></div><div><dt>Water level</dt><dd>${drain.water}</dd></div><div><dt>Flow rate</dt><dd>${drain.flow}</dd></div><div><dt>Debris</dt><dd>${drain.debris}</dd></div></dl>`;
    window.bootstrap?.Modal.getOrCreateInstance(document.querySelector('#drainDetailsModal')).show();
  });
  document.querySelector('#drainMap')?.addEventListener('keydown',event=>{
    if(window.flowguardDashboardReady||!['Enter',' '].includes(event.key))return;
    const marker=event.target.closest('[data-drain-id]');if(marker){event.preventDefault();marker.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
  });
  setMode('3d', true);
})();
