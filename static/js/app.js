// Load theme immediately to prevent flashing of unstyled content (FOUC)
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-theme');
}

// Global Application State
let appState = {
    updates: [],
    selectedUpdateId: null,
    currentFilter: 'all',
    searchQuery: '',
    stats: {
        total: 0,
        features: 0,
        issues: 0,
        other: 0
    }
};

// Progress Ring Configuration
const CIRCUMFERENCE = 2 * Math.PI * 10; // r=10 => ~62.83

// DOM Elements
const refreshBtn = document.getElementById('refresh-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const exportCsvBtn = document.getElementById('export-csv-btn');
const spinner = document.getElementById('spinner');
const syncStatus = document.getElementById('sync-status');
const updatesList = document.getElementById('updates-list');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const errorMessage = document.getElementById('error-message');
const emptyState = document.getElementById('empty-state');
const retryBtn = document.getElementById('retry-btn');

// Stats DOM Elements
const statTotal = document.getElementById('stat-total');
const statFeatures = document.getElementById('stat-features');
const statIssues = document.getElementById('stat-issues');
const statOther = document.getElementById('stat-other');

// Stats Card Containers (for click filtering)
const statCardTotal = document.getElementById('stat-card-total');
const statCardFeatures = document.getElementById('stat-card-features');
const statCardIssues = document.getElementById('stat-card-issues');
const statCardOther = document.getElementById('stat-card-other');

// Search Clear Button
const searchClearBtn = document.getElementById('search-clear-btn');

// Reset Tweet Button
const resetTweetBtn = document.getElementById('reset-tweet-btn');

// Search & Filter DOM Elements
const searchInput = document.getElementById('search-input');
const filterButtons = document.querySelectorAll('.btn-filter');

// Composer DOM Elements
const composerEmpty = document.getElementById('composer-empty');
const composerActive = document.getElementById('composer-active');
const tweetTextarea = document.getElementById('tweet-textarea');
const tweetSubmitBtn = document.getElementById('tweet-submit-btn');
const copyTweetBtn = document.getElementById('copy-tweet-btn');
const charProgress = document.getElementById('char-progress');
const charCountText = document.getElementById('char-count-text');
const charCountContainer = document.querySelector('.tweet-char-count');
const previewCardTitle = document.getElementById('preview-card-title');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // Setup Circle Progress Ring
    if (charProgress) {
        charProgress.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
        charProgress.style.strokeDashoffset = CIRCUMFERENCE;
    }

    // Load initial data
    loadReleaseNotes(false);

    // Event Listeners
    refreshBtn.addEventListener('click', () => loadReleaseNotes(true));
    themeToggleBtn.addEventListener('click', toggleTheme);
    exportCsvBtn.addEventListener('click', exportToCSV);
    retryBtn.addEventListener('click', () => loadReleaseNotes(true));
    
    // Search input and clear button
    searchInput.addEventListener('input', handleSearch);
    searchClearBtn.addEventListener('click', clearSearch);
    
    // Reset Composer button
    resetTweetBtn.addEventListener('click', () => {
        if (appState.selectedUpdateId) {
            selectUpdate(appState.selectedUpdateId);
            showToast("Tweet draft reset to default!");
        }
    });
    
    // Interactive Stats Cards
    statCardTotal.addEventListener('click', () => triggerCategoryFilter('all'));
    statCardFeatures.addEventListener('click', () => triggerCategoryFilter('Feature'));
    statCardIssues.addEventListener('click', () => triggerCategoryFilter('Issue'));
    statCardOther.addEventListener('click', () => triggerCategoryFilter('other'));
    
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterButtons.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            appState.currentFilter = e.currentTarget.dataset.filter;
            filterAndDisplayUpdates();
        });
    });

    tweetTextarea.addEventListener('input', updateCharCount);
    tweetSubmitBtn.addEventListener('click', postTweet);
    copyTweetBtn.addEventListener('click', copyTweetText);
    
    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboardNavigation);
});

// Fetch & Parse Release Notes from API
async function loadReleaseNotes(forceRefresh = false) {
    showLoading();
    
    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Server returned HTTP ${response.status}`);
        }
        
        const json = await response.json();
        
        if (json.status === 'success') {
            appState.updates = json.data.updates;
            
            // Update Sync Status
            const sourceText = json.source === 'cache' ? 'Cached' : 'Synced';
            syncStatus.textContent = `${sourceText} at ${json.data.timestamp.split(' ')[1]}`;
            
            // Calculate statistics
            calculateStats();
            
            // Filter and Display
            filterAndDisplayUpdates();
            
            // Auto-select the first update if available and nothing is selected
            if (appState.updates.length > 0 && !appState.selectedUpdateId) {
                const firstUpdate = appState.updates[0];
                selectUpdate(firstUpdate.id);
            }
            
            showContent();
        } else {
            throw new Error(json.message || 'Failed to fetch release notes.');
        }
    } catch (error) {
        console.error("Error loading release notes:", error);
        showError(error.message);
    }
}

// Stats Calculation
function calculateStats() {
    const updates = appState.updates;
    appState.stats.total = updates.length;
    appState.stats.features = updates.filter(u => u.type.toLowerCase() === 'feature').length;
    appState.stats.issues = updates.filter(u => u.type.toLowerCase() === 'issue').length;
    appState.stats.other = updates.length - appState.stats.features - appState.stats.issues;
    
    // Update DOM
    statTotal.textContent = appState.stats.total;
    statFeatures.textContent = appState.stats.features;
    statIssues.textContent = appState.stats.issues;
    statOther.textContent = appState.stats.other;
}

// Search Logic
function handleSearch(e) {
    appState.searchQuery = e.target.value.toLowerCase();
    searchClearBtn.style.display = appState.searchQuery ? 'flex' : 'none';
    filterAndDisplayUpdates();
}

function clearSearch() {
    searchInput.value = '';
    appState.searchQuery = '';
    searchClearBtn.style.display = 'none';
    filterAndDisplayUpdates();
    searchInput.focus();
}

// Filter and Render updates list
function filterAndDisplayUpdates() {
    const query = appState.searchQuery;
    const filter = appState.currentFilter;
    
    const filtered = appState.updates.filter(update => {
        // Filter by Tag (Total, Feature, Issue, or "Other")
        let matchesFilter = false;
        if (filter === 'all') {
            matchesFilter = true;
        } else if (filter === 'other') {
            const typeLower = update.type.toLowerCase();
            matchesFilter = typeLower !== 'feature' && typeLower !== 'issue' && typeLower !== 'changed' && typeLower !== 'deprecated';
        } else {
            matchesFilter = update.type.toLowerCase() === filter.toLowerCase();
        }
        
        // Filter by Search Query
        const textToSearch = `${update.date} ${update.type} ${update.text_content}`.toLowerCase();
        const matchesQuery = !query || textToSearch.includes(query);
        
        return matchesFilter && matchesQuery;
    });
    
    renderUpdates(filtered);
}

// Render the updates in the Left Panel
function renderUpdates(filteredUpdates) {
    updatesList.innerHTML = '';
    
    if (filteredUpdates.length === 0) {
        updatesList.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
    }
    
    emptyState.style.display = 'none';
    updatesList.style.display = 'flex';
    
    // Group updates by Date
    let currentGroupDate = '';
    let groupContainer = null;
    
    filteredUpdates.forEach(update => {
        // If it's a new date, create a date header
        if (update.date !== currentGroupDate) {
            currentGroupDate = update.date;
            
            const header = document.createElement('div');
            header.className = 'date-section-header';
            header.textContent = update.date;
            updatesList.appendChild(header);
        }
        
        // Create Card Element
        const card = document.createElement('div');
        const typeClass = update.type.toLowerCase();
        card.className = `update-card type-${typeClass} ${appState.selectedUpdateId === update.id ? 'selected' : ''}`;
        card.id = `card-${update.id}`;
        card.dataset.id = update.id;
        
        // Badge color class
        let badgeClass = 'badge-other';
        if (typeClass === 'feature') badgeClass = 'badge-feature';
        else if (typeClass === 'issue') badgeClass = 'badge-issue';
        else if (typeClass === 'changed') badgeClass = 'badge-changed';
        else if (typeClass === 'deprecated') badgeClass = 'badge-deprecated';
        
        // Force links inside card content to open in new tab (target="_blank")
        const processedHtml = update.html_content.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');

        card.innerHTML = `
            <div class="card-header">
                <div class="card-tags">
                    <span class="badge ${badgeClass}">${update.type}</span>
                </div>
                <div class="selection-indicator">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            </div>
            <div class="card-content">
                ${processedHtml}
            </div>
            <div class="card-actions-footer">
                <button class="card-copy-trigger" data-id="${update.id}">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy</span>
                </button>
                <button class="card-tweet-trigger" data-id="${update.id}">
                    <svg viewBox="0 0 24 24">
                        <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
                    </svg>
                    <span>Draft Tweet</span>
                </button>
            </div>
        `;
        
        // Add card click listeners
        card.addEventListener('click', (e) => {
            // Check if tweet button, copy button, or anchor tag was clicked, if so don't trigger select
            if (e.target.closest('a') || e.target.closest('.card-tweet-trigger') || e.target.closest('.card-copy-trigger')) {
                return;
            }
            selectUpdate(update.id);
        });
        
        // Copy Trigger Button click listener
        card.querySelector('.card-copy-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            copyCardText(update.id);
        });
        
        // Tweet Trigger Button click listener
        card.querySelector('.card-tweet-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            selectUpdate(update.id);
            // Scroll composer into view on mobile
            if (window.innerWidth <= 1024) {
                composerActive.scrollIntoView({ behavior: 'smooth' });
            }
        });
        
        updatesList.appendChild(card);
    });
}

// Select an update to tweet about it
function selectUpdate(id) {
    appState.selectedUpdateId = id;
    
    // Update card selection classes in DOM
    document.querySelectorAll('.update-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    const selectedCard = document.getElementById(`card-${id}`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    const update = appState.updates.find(u => u.id === id);
    if (!update) return;
    
    // Draft tweet text
    // Format: 📢 New BigQuery Feature (June 15, 2026): \n\n Content... \n\n Link
    const typeLabel = update.type.charAt(0).toUpperCase() + update.type.slice(1).toLowerCase();
    const prefix = `📢 BigQuery ${typeLabel} Update (${update.date}):\n\n`;
    const suffix = `\n\nRead more: ${update.link}\n#BigQuery #GCP`;
    
    // We want the total draft to fit in 280 characters.
    // Twitter counts links as 23 characters.
    const urlLengthInTwitter = 23;
    const hashtagText = "\n#BigQuery #GCP";
    const linkIntroText = "\n\nRead more: ";
    
    // Static size: prefix length + linkIntroText length + urlLengthInTwitter + hashtagText length
    const staticLength = calculateTwitterTextLength(prefix) + linkIntroText.length + urlLengthInTwitter + hashtagText.length;
    const maxContentLength = 280 - staticLength;
    
    let textContent = update.text_content;
    if (textContent.length > maxContentLength) {
        // Subtract 3 for ellipsis
        textContent = textContent.substring(0, maxContentLength - 3) + '...';
    }
    
    const tweetText = `${prefix}${textContent}${linkIntroText}${update.link}${hashtagText}`;
    
    // Populate textarea
    tweetTextarea.value = tweetText;
    
    // Update Tweet Card Link Preview
    previewCardTitle.textContent = `${update.type} Update - BigQuery Release Notes`;
    
    // Reveal Composer UI
    composerEmpty.style.display = 'none';
    composerActive.style.display = 'flex';
    
    updateCharCount();
}

// Calculate length of tweet text, accounting for Twitter's 23-character URL replacement rule
function calculateTwitterTextLength(text) {
    // Regex to find urls
    const urlRegex = /https?:\/\/[^\s]+/g;
    let length = text.length;
    const matches = text.match(urlRegex);
    
    if (matches) {
        matches.forEach(match => {
            // Subtract actual URL length and add 23
            length = length - match.length + 23;
        });
    }
    return length;
}

// Update character counter and progress ring
function updateCharCount() {
    const text = tweetTextarea.value;
    const length = calculateTwitterTextLength(text);
    const limit = 280;
    const remaining = limit - length;
    
    charCountText.textContent = remaining;
    
    // Reset classes
    charCountContainer.classList.remove('char-limit-warning', 'char-limit-exceeded');
    tweetSubmitBtn.disabled = false;
    
    if (length > limit) {
        charCountContainer.classList.add('char-limit-exceeded');
        tweetSubmitBtn.disabled = true; // Disable tweeting if over limit
    } else if (remaining <= 20) {
        charCountContainer.classList.add('char-limit-warning');
    }
    
    // Update Progress Ring
    const percentage = Math.min(length / limit, 1);
    const strokeDashoffset = CIRCUMFERENCE - (percentage * CIRCUMFERENCE);
    charProgress.style.strokeDashoffset = strokeDashoffset;
}

// Open Tweet Web Intent in new tab
function postTweet() {
    const text = tweetTextarea.value;
    const length = calculateTwitterTextLength(text);
    
    if (length > 280) {
        showToast("Tweet exceeds the 280-character limit!", true);
        return;
    }
    
    const encodedText = encodeURIComponent(text);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    window.open(twitterUrl, '_blank');
}

// Copy Tweet text to clipboard
function copyTweetText() {
    const text = tweetTextarea.value;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Tweet copied to clipboard!");
    }).catch(err => {
        console.error('Could not copy text: ', err);
        showToast("Failed to copy text", true);
    });
}

// UI State Management Helpers
function showLoading() {
    refreshBtn.disabled = true;
    spinner.classList.add('spinning');
    loadingState.style.display = 'flex';
    updatesList.style.display = 'none';
    emptyState.style.display = 'none';
    errorState.style.display = 'none';
}

function showContent() {
    refreshBtn.disabled = false;
    spinner.classList.remove('spinning');
    loadingState.style.display = 'none';
}

function showError(message) {
    refreshBtn.disabled = false;
    spinner.classList.remove('spinning');
    loadingState.style.display = 'none';
    updatesList.style.display = 'none';
    emptyState.style.display = 'none';
    
    errorMessage.textContent = message;
    errorState.style.display = 'flex';
    
    // Hide composer active on critical fetch error
    composerActive.style.display = 'none';
    composerEmpty.style.display = 'flex';
}

// Toast System
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    
    toastMsg.textContent = message;
    toast.className = 'toast';
    
    if (isError) {
        toast.classList.add('error');
    }
    
    toast.classList.add('show');
    
    // Clear previous timeout if exists
    if (window.toastTimeout) {
        clearTimeout(window.toastTimeout);
    }
    
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

// Copy granular card text directly
function copyCardText(id) {
    const update = appState.updates.find(u => u.id === id);
    if (!update) return;
    
    const formattedText = `📢 BigQuery ${update.type} Update (${update.date}):\n\n${update.text_content}\n\nRead more: ${update.link}`;
    
    navigator.clipboard.writeText(formattedText).then(() => {
        showToast("Update copied to clipboard!");
    }).catch(err => {
        console.error('Could not copy card text: ', err);
        showToast("Failed to copy text", true);
    });
}

// Export the currently filtered list of updates to CSV
function exportToCSV() {
    const query = appState.searchQuery;
    const filter = appState.currentFilter;
    
    // Filter the items just like we do for display
    const filtered = appState.updates.filter(update => {
        const matchesFilter = filter === 'all' || update.type.toLowerCase() === filter.toLowerCase();
        const textToSearch = `${update.date} ${update.type} ${update.text_content}`.toLowerCase();
        const matchesQuery = !query || textToSearch.includes(query);
        return matchesFilter && matchesQuery;
    });

    if (filtered.length === 0) {
        showToast("No updates to export!", true);
        return;
    }

    // Build CSV Content
    let csvContent = "\ufeffDate,Type,Link,Content\n"; // Include BOM for proper UTF-8 handling in Excel
    
    filtered.forEach(item => {
        const row = [
            item.date,
            item.type,
            item.link,
            item.text_content
        ].map(val => {
            // Escape double quotes and wrap in quotes
            const cleanVal = val.replace(/"/g, '""');
            return `"${cleanVal}"`;
        }).join(",");
        csvContent += row + "\n";
    });

    // Create a download link for the CSV blob
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const filterSuffix = filter !== 'all' ? `_${filter.toLowerCase()}` : '';
    link.setAttribute("download", `bigquery_releases${filterSuffix}_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("CSV exported successfully!");
}

// Help stats bar triggers filters
function triggerCategoryFilter(category) {
    appState.currentFilter = category;
    
    // Update active state class on filter buttons
    filterButtons.forEach(btn => {
        if (btn.dataset.filter.toLowerCase() === category.toLowerCase()) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    filterAndDisplayUpdates();
    showToast(`Filtering updates: ${category === 'all' ? 'All' : category}`);
}

// Keyboard arrow keys navigation between cards
function handleKeyboardNavigation(e) {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        return;
    }
    
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
        return;
    }
    
    e.preventDefault();
    
    const query = appState.searchQuery;
    const filter = appState.currentFilter;
    
    const filtered = appState.updates.filter(update => {
        let matchesFilter = false;
        if (filter === 'all') {
            matchesFilter = true;
        } else if (filter === 'other') {
            const typeLower = update.type.toLowerCase();
            matchesFilter = typeLower !== 'feature' && typeLower !== 'issue' && typeLower !== 'changed' && typeLower !== 'deprecated';
        } else {
            matchesFilter = update.type.toLowerCase() === filter.toLowerCase();
        }
        
        const textToSearch = `${update.date} ${update.type} ${update.text_content}`.toLowerCase();
        const matchesQuery = !query || textToSearch.includes(query);
        
        return matchesFilter && matchesQuery;
    });
    
    if (filtered.length === 0) return;
    
    let currentIndex = filtered.findIndex(u => u.id === appState.selectedUpdateId);
    let nextIndex = 0;
    
    if (e.key === 'ArrowDown') {
        nextIndex = currentIndex + 1 < filtered.length ? currentIndex + 1 : 0;
    } else if (e.key === 'ArrowUp') {
        nextIndex = currentIndex - 1 >= 0 ? currentIndex - 1 : filtered.length - 1;
    }
    
    const nextUpdate = filtered[nextIndex];
    selectUpdate(nextUpdate.id);
    
    const cardEl = document.getElementById(`card-${nextUpdate.id}`);
    if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// Toggle page color scheme between dark and light themes
function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    showToast(`${isLight ? 'Light' : 'Dark'} theme activated!`);
}
