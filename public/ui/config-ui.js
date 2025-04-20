// config-ui.js
import { loadConfig, saveConfig, runCleanupNow, disconnectPlugin } from './api.js';

const PLATFORM_PLUGIN_MAPPING = {
  "plugin:whatsapp": "whatsapp",
  "plugin:messenger": "messenger",
  "plugin:telegram": "telegram",
  "plugin:email": "email",
  "plugin:instagram": "instagram",
  "plugin:website": "webchat"
};

export async function initWipeBotUI() {
  const config = await loadConfig();
  const filterList = document.getElementById("filterList");
  const addFilterBtn = document.getElementById("addFilterBtn");
  const resetBtn = document.getElementById("resetBtn");
  const cleanupBtn = document.getElementById("cleanupBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const groupList = document.getElementById("groupList");
  const createGroupBtn = document.getElementById("createGroupBtn");

  await loadAvailablePlatforms();

  renderGroups(config.groups);
  renderFilters(config.filters, config.groups);
  setupFormInteractions(config.filters, config.groups);
  setupDragAndDrop(config.filters);
  addFilterBtn.addEventListener("click", () => handleAddOrUpdate(config));
  resetBtn.addEventListener("click", () => resetForm());
  cleanupBtn.addEventListener("click", () => runCleanupNow());
  disconnectBtn.addEventListener("click", () => disconnectPlugin(config));
  createGroupBtn.addEventListener("click", () => handleCreateGroup(config));
}

async function loadAvailablePlatforms() {
  const platformContainer = document.querySelectorAll("input.platform, label[for='platform']");

  platformContainer.forEach((el) => el.remove()); // Alte entfernen

  const parent = document.querySelector("#autoTime").parentNode;
  const label = document.createElement("label");
  label.textContent = "Plattformen";
  parent.insertBefore(label, document.getElementById("includeTagContainer"));

  const checkboxContainer = document.createElement("div");
  checkboxContainer.classList.add("platform-container");

  try {
    const res = await fetch(`/config/installed-plugins`);
    const data = await res.json();

    const platforms = new Set();

    data.forEach((plugin) => {
      const platform = PLATFORM_PLUGIN_MAPPING[plugin.plugin_id];
      if (platform) platforms.add(platform);
    });

    // "Alle Plattformen"-Checkbox
    checkboxContainer.appendChild(createCheckbox("alle", "Alle Plattformen"));

    platforms.forEach((platform) => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      checkboxContainer.appendChild(createCheckbox(platform, label));
    });

    parent.insertBefore(checkboxContainer, document.getElementById("includeTagContainer"));
  } catch (err) {
    console.warn("Plattformen konnten nicht geladen werden:", err);
    // Fallback (statisch)
    const fallback = ["whatsapp", "webchat", "email", "messenger", "instagram", "telegram"];
    checkboxContainer.appendChild(createCheckbox("alle", "Alle Plattformen"));
    fallback.forEach((platform) => {
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      checkboxContainer.appendChild(createCheckbox(platform, label));
    });
    parent.insertBefore(checkboxContainer, document.getElementById("includeTagContainer"));
  }
}

function createCheckbox(value, labelText) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "platform";
  input.value = value;
  label.appendChild(input);
  label.append(` ${labelText}`);
  return label;
}

// ... alle bestehenden Funktionen wie renderGroups, renderFilters, setupFormInteractions, etc. bleiben unverändert ...
