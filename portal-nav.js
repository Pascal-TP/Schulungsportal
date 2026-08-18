(() => {
  const nav = document.getElementById('portal-nav');
  const sidebarMain = document.getElementById('sidebar-main');
  if (!nav || !sidebarMain) return;

  const menuByPage = {
    'page-employee': [
      ['dashboard', 'Dashboard'],
      ['my-trainings', 'Meine Schulungen'],
      ['my-progress', 'Mein Bearbeitungsstand']
    ],
    'page-supervisor': [
      ['dashboard', 'Dashboard'],
      ['my-trainings', 'Meine Schulungen'],
      ['my-progress', 'Mein Bearbeitungsstand'],
      ['employees', 'Meine Mitarbeiter'],
      ['team-progress', 'Bearbeitungsstand Mitarbeiter'],
      ['training-matrix', 'Tabellarische Schulungsübersicht']
    ],
    'page-admin': [
      ['dashboard', 'Dashboard'],
      ['my-trainings', 'Meine Schulungen'],
      ['my-progress', 'Mein Bearbeitungsstand'],
      ['proofs', 'Nachweise je Mitarbeiter'],
      ['users', 'Benutzerverwaltung'],
      ['training-management', 'Schulungsverwaltung'],
      ['training-matrix', 'Tabellarische Schulungsübersicht']
    ]
  };

  let currentPageId = null;

  function activateManagementSubview(group, target, options = {}) {
    const page = document.getElementById('page-admin');
    if (!page) return;

    const navHolder = page.querySelector(`[data-management-nav="${group}"]`);
    if (!navHolder) return;

    navHolder.querySelectorAll('.management-choice-card').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.managementTarget === target);
    });

    const prefix = group === 'users' ? 'users-' : 'trainings-';
    page.querySelectorAll(`[data-management-view^="${prefix}"]`).forEach(view => {
      view.classList.toggle('active', view.dataset.managementView === target);
    });

    if (target === 'users-list') {
      document.getElementById('btn-load-users')?.click();
    } else if (target === 'trainings-list') {
      document.getElementById('btn-load-trainings')?.click();
    } else if (target === 'users-create' && options.reset !== false) {
      document.getElementById('cancel-user-edit-btn')?.click();
    } else if (target === 'trainings-create' && options.reset !== false) {
      document.getElementById('cancel-training-edit-btn')?.click();
    }
  }

  function initializeManagementNavigation() {
    document.querySelectorAll('[data-management-nav]').forEach(holder => {
      if (holder.dataset.navReady === '1') return;
      holder.querySelectorAll('.management-choice-card').forEach(btn => {
        btn.addEventListener('click', () => {
          activateManagementSubview(holder.dataset.managementNav, btn.dataset.managementTarget);
        });
      });
      holder.dataset.navReady = '1';
    });
  }

  function showView(view) {
    if (!currentPageId) return;
    const page = document.getElementById(currentPageId);
    if (!page) return;
    page.querySelectorAll('.portal-view').forEach(el => {
      el.classList.toggle('active-view', el.dataset.view === view);
    });
    nav.querySelectorAll('.portal-nav-btn').forEach(btn => {
      const active = btn.dataset.view === view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (currentPageId === 'page-admin' && view === 'users') {
      activateManagementSubview('users', 'users-list', { reset: false });
    }
    if (currentPageId === 'page-admin' && view === 'training-management') {
      activateManagementSubview('trainings', 'trainings-list', { reset: false });
    }
  }

  function buildDashboardLinks(pageId) {
    const page = document.getElementById(pageId);
    const holder = page?.querySelector('[data-dashboard-links]');
    if (!holder || holder.dataset.built === '1') return;
    const items = (menuByPage[pageId] || []).filter(([key]) => key !== 'dashboard');
    holder.innerHTML = '';
    items.forEach(([key, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dashboard-link-card';
      button.innerHTML = `<span>${label}</span><small>Bereich öffnen</small>`;
      button.addEventListener('click', () => showView(key));
      holder.appendChild(button);
    });
    holder.dataset.built = '1';
  }

  function activateForPage(pageId) {
    currentPageId = menuByPage[pageId] ? pageId : null;
    if (!currentPageId) {
      sidebarMain.classList.add('hidden');
      nav.innerHTML = '';
      return;
    }

    sidebarMain.classList.remove('hidden');
    nav.innerHTML = '';
    menuByPage[pageId].forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'portal-nav-btn';
      btn.dataset.view = key;
      btn.textContent = label;
      btn.addEventListener('click', () => showView(key));
      nav.appendChild(btn);
    });
    buildDashboardLinks(pageId);
    showView('dashboard');
  }

  function syncActivePage() {
    const active = document.querySelector('.page.active-page');
    const id = active?.id || null;
    if (id !== currentPageId) activateForPage(id);
  }

  // Wenn aus der Anzeigen-Liste „Bearbeiten“ gewählt wird, direkt das passende Formular öffnen.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.textContent.trim() !== 'Bearbeiten') return;

    if (button.closest('#admin-user-list')) {
      setTimeout(() => activateManagementSubview('users', 'users-create', { reset: false }), 0);
    } else if (button.closest('#admin-training-list')) {
      setTimeout(() => activateManagementSubview('trainings', 'trainings-create', { reset: false }), 0);
    }
  });

  const observer = new MutationObserver(syncActivePage);
  document.querySelectorAll('.page').forEach(page => {
    observer.observe(page, { attributes: true, attributeFilter: ['class'] });
  });

  initializeManagementNavigation();
  syncActivePage();
})();
