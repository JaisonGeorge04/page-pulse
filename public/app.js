document.addEventListener('DOMContentLoaded', () => {
  const auditForm = document.getElementById('auditForm');
  const urlInput = document.getElementById('urlInput');
  const submitBtn = document.getElementById('submitBtn');
  const serverStatus = document.getElementById('serverStatus');
  const rateLimitText = document.getElementById('rateLimitText');
  
  // Sections
  const errorAlert = document.getElementById('errorAlert');
  const errorTitle = document.getElementById('errorTitle');
  const errorMessage = document.getElementById('errorMessage');
  const errorRequestId = document.getElementById('errorRequestId');
  
  const loadingState = document.getElementById('loadingState');
  const resultsSection = document.getElementById('resultsSection');

  // Summary Metrics Elements
  const summaryStatus = document.getElementById('summaryStatus');
  const summaryContentType = document.getElementById('summaryContentType');
  const summaryLatency = document.getElementById('summaryLatency');
  const summaryLatencyRating = document.getElementById('summaryLatencyRating');
  const summaryPageSize = document.getElementById('summaryPageSize');
  const summaryHttps = document.getElementById('summaryHttps');
  const summaryCacheStatus = document.getElementById('summaryCacheStatus');
  const summaryCacheTtl = document.getElementById('summaryCacheTtl');

  // Diagnostic Detail Card Elements
  const cardTitle = document.getElementById('cardTitle');
  const badgeTitle = document.getElementById('badgeTitle');
  const valTitle = document.getElementById('valTitle');
  const lenTitle = document.getElementById('lenTitle');
  const msgTitle = document.getElementById('msgTitle');

  const cardDesc = document.getElementById('cardDesc');
  const badgeDesc = document.getElementById('badgeDesc');
  const valDesc = document.getElementById('valDesc');
  const lenDesc = document.getElementById('lenDesc');
  const msgDesc = document.getElementById('msgDesc');

  const cardH1 = document.getElementById('cardH1');
  const badgeH1 = document.getElementById('badgeH1');
  const countH1 = document.getElementById('countH1');
  const listH1 = document.getElementById('listH1');
  const msgH1 = document.getElementById('msgH1');

  const cardImages = document.getElementById('cardImages');
  const badgeImages = document.getElementById('badgeImages');
  const totalImages = document.getElementById('totalImages');
  const missingAltImages = document.getElementById('missingAltImages');
  const msgImages = document.getElementById('msgImages');

  const totalLinks = document.getElementById('totalLinks');
  const internalLinks = document.getElementById('internalLinks');
  const externalLinks = document.getElementById('externalLinks');

  // Check Server Health & Config on Load
  const initApp = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        rateLimitText.textContent = `Rate limit: ${data.config.rateLimitMax} reqs / 1 min`;
        serverStatus.querySelector('.status-dot').className = 'status-dot pulse';
        serverStatus.querySelector('.status-text').textContent = 'Server: Online';
      }
    } catch (err) {
      serverStatus.querySelector('.status-dot').className = 'status-dot';
      serverStatus.querySelector('.status-dot').style.backgroundColor = '#ef4444';
      serverStatus.querySelector('.status-text').textContent = 'Server: Offline';
    }
  };

  initApp();

  // Audit Form Submission
  auditForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = urlInput.value.trim();
    if (!url) return;

    // Reset view states
    errorAlert.classList.add('hidden');
    resultsSection.classList.add('hidden');
    loadingState.classList.remove('hidden');
    
    // Disable inputs
    urlInput.disabled = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      // Parse Rate Limit headers
      const rlLimit = response.headers.get('ratelimit-limit');
      const rlRemaining = response.headers.get('ratelimit-remaining');
      if (rlRemaining !== null && rlLimit !== null) {
        rateLimitText.textContent = `Quota: ${rlRemaining}/${rlLimit} left`;
      }

      const resData = await response.json();

      if (!response.ok) {
        throw {
          status: response.status,
          error: resData.error || 'AUDIT_FAILED',
          message: resData.message || 'Audit request failed.',
          requestId: resData.requestId || response.headers.get('x-request-id') || 'N/A',
          details: resData.details
        };
      }

      // Display Successful Audit Result
      renderReport(resData);
      
    } catch (err) {
      console.error('Audit operation error:', err);
      displayError(err);
    } finally {
      // Re-enable inputs
      loadingState.classList.add('hidden');
      urlInput.disabled = false;
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });

  // Render Report Data
  const renderReport = ({ report, cached, remainingTtlSeconds }) => {
    // 1. Summary Cards
    // Status Code
    summaryStatus.textContent = `${report.statusCode} ${report.statusText}`;
    if (report.statusCode >= 200 && report.statusCode < 300) {
      summaryStatus.className = 'card-val text-good';
      summaryStatus.style.color = 'var(--color-good)';
    } else if (report.statusCode >= 300 && report.statusCode < 400) {
      summaryStatus.className = 'card-val text-warning';
      summaryStatus.style.color = 'var(--color-warning)';
    } else {
      summaryStatus.className = 'card-val text-error';
      summaryStatus.style.color = 'var(--color-error)';
    }
    summaryContentType.textContent = `Type: ${report.contentType.split(';')[0]}`;

    // Response Time
    summaryLatency.textContent = `${report.responseTimeMs} ms`;
    if (report.responseTimeMs <= 300) {
      summaryLatencyRating.textContent = 'Performance: Blazing Fast';
      summaryLatencyRating.style.color = 'var(--color-good)';
      summaryLatency.style.color = 'var(--color-good)';
    } else if (report.responseTimeMs <= 1000) {
      summaryLatencyRating.textContent = 'Performance: Average';
      summaryLatencyRating.style.color = 'var(--color-warning)';
      summaryLatency.style.color = 'var(--color-warning)';
    } else {
      summaryLatencyRating.textContent = 'Performance: Slow Response';
      summaryLatencyRating.style.color = 'var(--color-error)';
      summaryLatency.style.color = 'var(--color-error)';
    }

    // Page Size & SSL
    summaryPageSize.textContent = `${(report.pageSizeBytes / 1024).toFixed(2)} KB`;
    if (report.isHttps) {
      summaryHttps.innerHTML = '<i data-lucide="lock" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;color:var(--color-good)"></i> SSL Secure';
      summaryHttps.style.color = 'var(--color-good)';
    } else {
      summaryHttps.innerHTML = '<i data-lucide="lock-open" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;color:var(--color-error)"></i> SSL Insecure';
      summaryHttps.style.color = 'var(--color-error)';
    }

    // Cache Stats
    if (cached) {
      summaryCacheStatus.textContent = 'HIT';
      summaryCacheStatus.style.color = 'var(--color-info)';
      summaryCacheTtl.textContent = `Served from cache (TTL: ${remainingTtlSeconds}s)`;
    } else {
      summaryCacheStatus.textContent = 'MISS';
      summaryCacheStatus.style.color = 'var(--text-secondary)';
      summaryCacheTtl.textContent = 'Fresh page fetch executed';
    }

    // 2. SEO Diagnostics Detail Cards
    // Title Card
    updateDetailCard(
      cardTitle, 
      badgeTitle, 
      report.seo.title.status, 
      report.seo.title.text ? `"${report.seo.title.text}"` : 'No Title Found', 
      valTitle
    );
    lenTitle.textContent = report.seo.title.length;
    msgTitle.textContent = report.seo.title.message;
    msgTitle.className = `feedback-msg ${report.seo.title.status.toLowerCase()}`;

    // Meta Description Card
    updateDetailCard(
      cardDesc, 
      badgeDesc, 
      report.seo.description.status, 
      report.seo.description.text ? `"${report.seo.description.text}"` : 'No Meta Description Found', 
      valDesc
    );
    lenDesc.textContent = report.seo.description.length;
    msgDesc.textContent = report.seo.description.message;
    msgDesc.className = `feedback-msg ${report.seo.description.status.toLowerCase()}`;

    // H1 Headings Card
    updateDetailCard(cardH1, badgeH1, report.seo.h1.status);
    countH1.textContent = report.seo.h1.count;
    listH1.innerHTML = '';
    if (report.seo.h1.items.length > 0) {
      report.seo.h1.items.forEach(h1Text => {
        const li = document.createElement('li');
        li.textContent = h1Text;
        listH1.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'None found';
      li.style.fontStyle = 'italic';
      li.style.borderLeft = '2px solid var(--text-muted)';
      listH1.appendChild(li);
    }
    msgH1.textContent = report.seo.h1.message;
    msgH1.className = `feedback-msg ${report.seo.h1.status.toLowerCase()}`;

    // Images Card
    updateDetailCard(cardImages, badgeImages, report.seo.images.status);
    totalImages.textContent = report.seo.images.total;
    missingAltImages.textContent = report.seo.images.missingAlt;
    msgImages.textContent = report.seo.images.message;
    msgImages.className = `feedback-msg ${report.seo.images.status.toLowerCase()}`;

    // Links Card
    totalLinks.textContent = report.seo.links.total;
    internalLinks.textContent = report.seo.links.internal;
    externalLinks.textContent = report.seo.links.external;

    // Refresh icons inside dynamically updated DOM
    lucide.createIcons();

    // Show Results
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  };

  // Helper to style detail cards based on status response
  const updateDetailCard = (cardEl, badgeEl, status, valueText, valueEl) => {
    // Reset classes
    cardEl.className = 'detail-card';
    cardEl.classList.add(`status-${status.toLowerCase()}`);
    
    badgeEl.textContent = status;
    badgeEl.className = `badge ${status.toLowerCase()}`;

    if (valueEl && valueText) {
      valueEl.textContent = valueText;
    }
  };

  // Display Error Alerts
  const displayError = (err) => {
    let title = 'Audit Request Failed';
    let msg = 'Failed to fetch the resource or the connection timed out. Please try again.';
    let reqId = 'N/A';

    if (err.error) {
      // Structured AppError from server
      reqId = err.requestId || 'N/A';
      if (err.error === 'VALIDATION_ERROR') {
        title = 'Validation Error';
        msg = err.message;
        if (err.details && Array.isArray(err.details)) {
          msg += ': ' + err.details.map(d => `${d.field} (${d.message})`).join(', ');
        }
      } else if (err.error === 'SSRF_BLOCKED') {
        title = 'Security Block (SSRF Prevention)';
        msg = 'The target domain resolves to a private or local network subnet. Access is prohibited.';
      } else if (err.error === 'RATE_LIMIT_EXCEEDED') {
        title = 'Quota Exceeded';
        msg = 'You have sent too many requests in a short time. Please slow down and try again.';
      } else if (err.error === 'CONCURRENCY_LIMIT_EXCEEDED') {
        title = 'Server Busy';
        msg = 'The server is currently operating at maximum capacity. Please wait a moment.';
      } else if (err.error === 'AUDIT_FAILED') {
        title = 'Analysis Failed';
        msg = err.message;
      } else {
        msg = err.message;
      }
    } else {
      // General network exception
      msg = err.message || msg;
    }

    errorTitle.textContent = title;
    errorMessage.textContent = msg;
    errorRequestId.textContent = `Request ID: ${reqId}`;
    errorAlert.classList.remove('hidden');
    errorAlert.scrollIntoView({ behavior: 'smooth' });
  };
});
