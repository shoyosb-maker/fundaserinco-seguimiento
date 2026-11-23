/* Fundaserinco · Seguimiento — desplegables con efecto glass */
window.FS = window.FS || {};

(function (FS) {
  'use strict';

  var active = null;
  var counter = 0;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function refresh(select) {
    var wrap = select && select.closest ? select.closest('.glass-select') : null;
    if (!wrap) return;
    var state = wrap.__glass;
    var option = select.options[select.selectedIndex];
    state.valueEl.textContent = option ? option.textContent : '';
    state.trigger.disabled = select.disabled;
    wrap.classList.toggle('is-disabled', select.disabled);
  }

  function buildMenu(wrap) {
    var state = wrap.__glass;
    var select = state.select;
    state.menu.innerHTML = Array.prototype.map.call(select.options, function (option, index) {
      var selected = option.value === select.value;
      return '<button type="button" class="glass-select__option" role="option" aria-selected="' + selected + '" data-index="' + index + '">' +
        '<span class="glass-select__option-label">' + esc(option.textContent) + '</span>' +
        '<span class="material-symbols-outlined glass-select__check" aria-hidden="true">check</span>' +
      '</button>';
    }).join('');
  }

  function close(wrap) {
    if (!wrap) return;
    wrap.classList.remove('is-open', 'is-up');
    wrap.__glass.menu.hidden = true;
    wrap.__glass.trigger.setAttribute('aria-expanded', 'false');
    if (active === wrap) active = null;
  }

  function open(wrap) {
    if (active && active !== wrap) close(active);
    buildMenu(wrap);
    var state = wrap.__glass;
    state.menu.hidden = false;
    wrap.classList.add('is-open');
    state.trigger.setAttribute('aria-expanded', 'true');
    active = wrap;

    var rect = wrap.getBoundingClientRect();
    var menuHeight = Math.min(state.menu.scrollHeight, 290);
    var openUp = rect.bottom + menuHeight + 16 > window.innerHeight && rect.top > menuHeight + 16;
    wrap.classList.toggle('is-up', openUp);

    var selected = state.menu.querySelector('[aria-selected="true"]') || state.menu.querySelector('.glass-select__option');
    if (selected) selected.focus();
  }

  function choose(wrap, index) {
    var state = wrap.__glass;
    var option = state.select.options[index];
    if (!option) return;
    if (state.select.value !== option.value) {
      state.select.value = option.value;
      state.select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    refresh(state.select);
    close(wrap);
    state.trigger.focus();
  }

  function onMenuClick(event) {
    var wrap = event.currentTarget.closest('.glass-select');
    var option = event.target.closest('.glass-select__option');
    if (!wrap || !option) return;
    choose(wrap, Number(option.dataset.index));
  }

  function onMenuKeydown(event) {
    var wrap = event.currentTarget.closest('.glass-select');
    var items = Array.prototype.slice.call(wrap.__glass.menu.querySelectorAll('.glass-select__option'));
    var index = items.indexOf(document.activeElement);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[Math.min(index + 1, items.length - 1)].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[Math.max(index - 1, 0)].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (document.activeElement.classList.contains('glass-select__option')) {
        choose(wrap, Number(document.activeElement.dataset.index));
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(wrap);
      wrap.__glass.trigger.focus();
    } else if (event.key === 'Tab') {
      close(wrap);
    }
  }

  function onTriggerKeydown(event) {
    var wrap = event.currentTarget.closest('.glass-select');
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open(wrap);
    } else if (event.key === 'Escape') {
      close(wrap);
    }
  }

  function enhance(root) {
    var scope = root || document;
    Array.prototype.forEach.call(scope.querySelectorAll('select:not([data-glass])'), function (select) {
      if (select.closest('.glass-select')) return;
      build(select);
    });
  }

  function build(select) {
    select.setAttribute('data-glass', '1');
    select.classList.add('glass-native');
    select.hidden = true;
    if (!select.id) select.id = 'glass-native-' + (++counter);

    var wrap = document.createElement('div');
    wrap.className = 'glass-select';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'glass-select__trigger';
    trigger.id = select.id + '-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span class="glass-select__value"></span>' +
      '<span class="material-symbols-outlined glass-select__chevron" aria-hidden="true">expand_more</span>';

    var menu = document.createElement('div');
    menu.className = 'glass-select__menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    wrap.appendChild(trigger);
    wrap.appendChild(menu);

    var labels = document.querySelectorAll('label[for]');
    for (var i = 0; i < labels.length; i++) {
      if (labels[i].getAttribute('for') === select.id) {
        labels[i].setAttribute('for', trigger.id);
        if (!trigger.getAttribute('aria-label')) {
          trigger.setAttribute('aria-label', labels[i].textContent.replace(/\s+/g, ' ').trim());
        }
        break;
      }
    }
    if (!trigger.getAttribute('aria-label') && select.getAttribute('aria-label')) {
      trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
    }

    wrap.__glass = {
      select: select,
      trigger: trigger,
      menu: menu,
      valueEl: trigger.querySelector('.glass-select__value')
    };

    trigger.addEventListener('click', function (event) {
      event.stopPropagation();
      if (active === wrap) close(wrap);
      else open(wrap);
    });
    trigger.addEventListener('keydown', onTriggerKeydown);
    menu.addEventListener('click', onMenuClick);
    menu.addEventListener('keydown', onMenuKeydown);

    refresh(select);
  }

  document.addEventListener('click', function (event) {
    if (active && !event.target.closest('.glass-select')) close(active);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopPropagation();
      var wrap = active;
      close(wrap);
      wrap.__glass.trigger.focus();
    }
  }, true);

  window.addEventListener('resize', function () { close(active); });
  window.addEventListener('scroll', function () { close(active); }, true);

  FS.glass = {
    enhance: enhance,
    refresh: refresh,
    refreshAll: function () {
      Array.prototype.forEach.call(document.querySelectorAll('select[data-glass]'), refresh);
    },
    close: function () { close(active); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { enhance(document); });
  } else {
    enhance(document);
  }
})(window.FS);
