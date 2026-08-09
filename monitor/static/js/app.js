(async () => {
  currentUser = await checkAuth();
  if (!currentUser) return;

  document.getElementById('user-name').textContent = currentUser.name;
  renderNav();
  setupSidebarToggle();
  if (currentUser.role !== 'administrator') {
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  setupNav();
  await renderRoute();
})();
