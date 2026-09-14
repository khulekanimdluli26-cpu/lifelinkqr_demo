// LifeLinkQR NOVA UI enhancement layer. No Firebase logic lives here.
(() => {
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  document.body.dataset.page = file.replace('.html','');

  document.querySelectorAll('nav a').forEach(a => {
    const href = (a.getAttribute('href') || '').split('?')[0].split('#')[0].toLowerCase();
    if (href && href === file) a.classList.add('is-active');
  });

  const revealTargets = [...document.querySelectorAll('main > section, main > div > section')];
  revealTargets.forEach((el, i) => {
    el.classList.add('reveal');
    el.style.transitionDelay = `${Math.min(i * 45, 180)}ms`;
  });

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: .06 }) : null;

  revealTargets.forEach(el => io ? io.observe(el) : el.classList.add('reveal-in'));

  document.querySelectorAll('button, .buttons a, .action, .action-card').forEach(el => {
    el.addEventListener('pointerdown', () => el.style.transform = 'translateY(0) scale(.985)', {passive:true});
    el.addEventListener('pointerup', () => el.style.transform = '', {passive:true});
    el.addEventListener('pointerleave', () => el.style.transform = '', {passive:true});
  });
})();
