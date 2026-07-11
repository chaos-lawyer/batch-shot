import { loadSettings, saveSettings } from '../utils/settings.js';
import { applyI18n, initI18n, message } from '../utils/i18n.js';

const $ = (id) => document.getElementById(id);

// Parser function to dynamically convert numbered lists to .step-list elements
function formatStepLists() {
  document.querySelectorAll('.body-content ul').forEach((ul) => {
    const lis = ul.querySelectorAll('li');
    if (lis.length === 0) return;
    
    const firstText = lis[0].textContent.trim();
    const match = firstText.match(/^(\d+)\.\s*/);
    
    if (match) {
      const ol = document.createElement('ol');
      ol.className = 'step-list';
      
      lis.forEach((li) => {
        const newLi = document.createElement('li');
        newLi.innerHTML = li.innerHTML.replace(/^(\d+)\.\s*/, '');
        ol.appendChild(newLi);
      });
      
      ul.parentNode.replaceChild(ol, ul);
    }
  });
}

// Custom translation helper to render rich text containing HTML
function applyHelpI18n() {
  applyI18n();
  document.querySelectorAll('[data-i18n-html]').forEach((node) => {
    node.innerHTML = message(node.dataset.i18nHtml);
  });
  formatStepLists();
}

function scrollNavLinkIntoView(link) {
  const nav = $('helpNav');
  if (!nav || !link || window.matchMedia('(max-width: 860px)').matches) {
    return;
  }

  const target = link.closest('.menu-item-group') || link;
  const navRect = nav.getBoundingClientRect();
  const linkRect = target.getBoundingClientRect();
  const topPadding = 18;
  const bottomPadding = 18;

  if (linkRect.top < navRect.top + topPadding) {
    nav.scrollBy({
      top: linkRect.top - navRect.top - topPadding,
      behavior: 'smooth'
    });
  } else if (linkRect.bottom > navRect.bottom - bottomPadding) {
    nav.scrollBy({
      top: linkRect.bottom - navRect.bottom + bottomPadding,
      behavior: 'smooth'
    });
  }
}

function setActiveNavLink(activeLink, { scroll = true } = {}) {
  if (!activeLink) {
    return;
  }

  const wasActive = activeLink.classList.contains('active');
  const navLinks = document.querySelectorAll('#helpNav a');
  navLinks.forEach((link) => link.classList.remove('active'));

  activeLink.classList.add('active');
  const parentGroup = activeLink.closest('.menu-item-group');
  const categoryLink = parentGroup?.querySelector('.category-link');
  if (categoryLink && categoryLink !== activeLink) {
    categoryLink.classList.add('active');
  }

  // Clean up category-links that don't own the active child
  document.querySelectorAll('.category-link').forEach((catLink) => {
    const group = catLink.closest('.menu-item-group');
    const hasSubmenu = group.querySelector('.submenu');
    if (hasSubmenu) {
      const hasActiveChild = group.querySelector('.submenu-link.active');
      if (!hasActiveChild) {
        catLink.classList.remove('active');
      }
    }
  });

  if (scroll && !wasActive) {
    scrollNavLinkIntoView(activeLink);
  }
}

function getVisibleNavLinks() {
  return Array.from(document.querySelectorAll('#helpNav a'))
    .filter((link) => !link.classList.contains('hidden-nav-item'));
}

async function initPage() {
  const settings = await loadSettings();

  // Apply theme
  const theme = settings.theme || 'auto';
  document.documentElement.dataset.theme = theme;

  // Apply language
  const language = settings.appLanguage || 'auto';
  await initI18n(language);
  applyHelpI18n();

  // Load version
  const versionEl = $('versionString');
  if (versionEl) {
    versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  }

  // Setup sidebar scrolling intersection observer
  setupScrollObserver();
}

function setupScrollObserver() {
  const articles = document.querySelectorAll('.help-article');
  const navLinks = document.querySelectorAll('#helpNav a');

  function activateLastVisibleLink() {
    const visibleLinks = getVisibleNavLinks();
    setActiveNavLink(visibleLinks[visibleLinks.length - 1]);
  }

  const observerOptions = {
    root: null,
    rootMargin: '-10% 0px -70% 0px', // Trigger when article is in the middle upper part of the viewport
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
    if (isAtBottom) {
      activateLastVisibleLink();
      return;
    }

    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        const activeLink = Array.from(navLinks).find((link) => link.getAttribute('href') === `#${id}`);
        setActiveNavLink(activeLink);
      }
    });
  }, observerOptions);

  articles.forEach((article) => observer.observe(article));

  // Handle boundary case when scroll reaches absolute bottom
  window.addEventListener('scroll', () => {
    const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
    if (isAtBottom) {
      activateLastVisibleLink();
    }
  });
}




// Search filter implementation
$('helpSearch').addEventListener('input', (event) => {
  const query = event.target.value.toLowerCase().trim();
  const sections = document.querySelectorAll('.section');
  const navLinks = document.querySelectorAll('#helpNav a');
  let totalVisibleCount = 0;

  sections.forEach((section) => {
    const articles = section.querySelectorAll('.help-article');
    let visibleArticlesCount = 0;

    articles.forEach((article) => {
      const textContent = article.textContent.toLowerCase();
      const isMatch = textContent.includes(query);

      const articleId = article.getAttribute('id');
      const subLink = Array.from(navLinks).find((link) => link.getAttribute('href') === `#${articleId}`);

      if (isMatch) {
        article.classList.remove('hidden-article');
        visibleArticlesCount++;
        totalVisibleCount++;
        if (subLink) subLink.classList.remove('hidden-nav-item');
      } else {
        article.classList.add('hidden-article');
        if (subLink) subLink.classList.add('hidden-nav-item');
      }
    });

    const sectionId = section.getAttribute('id');
    const catLink = Array.from(navLinks).find((link) => link.getAttribute('href') === `#${sectionId}`);

    if (visibleArticlesCount > 0) {
      section.classList.remove('hidden-section');
      if (catLink) catLink.classList.remove('hidden-nav-item');
    } else {
      section.classList.add('hidden-section');
      if (catLink) catLink.classList.add('hidden-nav-item');
    }
  });

  const noResultsEl = $('noResults');
  if (noResultsEl) {
    if (totalVisibleCount === 0) {
      noResultsEl.classList.remove('hidden');
    } else {
      noResultsEl.classList.add('hidden');
    }
  }

  // Toggle clear search button visibility
  const clearSearchBtn = $('clearSearchBtn');
  if (clearSearchBtn) {
    if (query.length > 0) {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
  }
});

// Clear search input trigger click
$('clearSearchBtn').addEventListener('click', () => {
  const searchInput = $('helpSearch');
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
});

// Reset search button inside empty state click
$('resetSearchBtn').addEventListener('click', () => {
  const searchInput = $('helpSearch');
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
});

// Smooth anchor scrolling
document.querySelectorAll('#helpNav a').forEach((anchor) => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const targetId = this.getAttribute('href');
    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth'
      });
      setActiveNavLink(this);
      // Set hash manually without jumping
      history.pushState(null, null, targetId);
    }
  });
});

// Intercept Ctrl+F / Cmd+F to focus help search input
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    const searchInput = $('helpSearch');
    if (searchInput) {
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  }
});

// Run initialization
document.addEventListener('DOMContentLoaded', initPage);
