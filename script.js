const chatMessages = document.getElementById("chatMessages");
let awaitingWallet = false;
let savedWallets = JSON.parse(localStorage.getItem("wallets") || "[]");

function addMessage(text, sender = "bot", isHTML = false) {
  const msg = document.createElement("div");
  msg.className = `message ${sender}`;
  const avatar = document.createElement("div");
  avatar.className = `avatar ${sender}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (isHTML) bubble.innerHTML = text;
  else bubble.textContent = text;
  msg.appendChild(avatar);
  msg.appendChild(bubble);
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function isValidEthAddress(addr) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function safeJoin(arr, sep = ", ") {
  return Array.isArray(arr) && arr.length > 0 ? arr.join(sep) : "N/A";
}

function summarizePortfolio(tokens) {
  if (!tokens || tokens.length === 0) return "No tokens in this wallet.";
  let stable = tokens.filter(t => /USDT|USDC|DAI/i.test(t.symbol));
  let eth = tokens.filter(t => /ETH/i.test(t.symbol));
  let summary = `This wallet holds ${tokens.length} tokens. `;
  if (stable.length > 0) summary += `Stablecoins detected: ${stable.map(t => t.symbol).join(", ")}. `;
  if (eth.length > 0) summary += `ETH balance: ${eth[0].balance} (~$${eth[0].balanceUSD}). `;
  if (stable.length === 0 && eth.length === 0) summary += "Mostly altcoins, higher volatility risk.";
  return summary;
}

async function fetchPortfolio(address, nickname, aggregateCollector = null) {
  try {
    const res = await fetch(`https://aura.adex.network/api/portfolio/strategies?address=${address}`);
    if (!res.ok) throw new Error("API error: " + res.status);
    const data = await res.json();

    if (aggregateCollector) {
      (data.portfolio || []).forEach(network => {
        (network.tokens || []).forEach(t => {
          aggregateCollector.push({
            symbol: t.symbol,
            balanceUSD: t.balanceUSD || 0
          });
        });
      });
      return;
    }

    if ((data.portfolio || []).length === 0 && (data.strategies || []).length === 0) {
      addMessage(`Wallet "${nickname}" has no tokens or strategies.`, "bot");
      return;
    }

    // Portfolio
    (data.portfolio || []).forEach(network => {
      let text = `<strong>${nickname} – ${network.network?.name ?? "Unknown Network"}</strong><br>`;
      (network.tokens || []).forEach(t => {
        text += `${t.symbol || "?"}: ${t.balance ?? 0} (~$${t.balanceUSD ?? 0})<br>`;
      });
      addMessage(text, "bot", true);
      addMessage("💡 Insight: " + summarizePortfolio(network.tokens), "bot");
    });

    // Strategies
    (data.strategies || []).forEach(strategyBlock => {
      (strategyBlock.response || []).forEach(strategy => {
        let text = `<strong>Strategy: ${strategy.name || "Unnamed"}</strong><br>
                    Risk: ${strategy.risk || "N/A"}<br>`;
        (strategy.actions || []).forEach(action => {
          text += `<div style="margin:6px 0;padding:6px;background:#f0f4ff;border-radius:6px;">
                    ${action.description || "No description"}<br>
                    <em>Tokens:</em> ${action.tokens || "N/A"}<br>
                    <em>Networks:</em> ${safeJoin(action.networks)}<br>
                    <em>Operations:</em> ${safeJoin(action.operations)}<br>
                    <em>APY:</em> ${action.apy || "N/A"}
                   </div>`;
        });
        addMessage(text, "bot", true);
      });
    });

  } catch (err) {
    addMessage("❌ Error: " + err.message, "bot");
  }
}

async function buildDashboard() {
  if (savedWallets.length === 0) {
    addMessage("⚠️ No wallets saved. Use: add wallet <address> <nickname>", "bot");
    return;
  }
  addMessage('<div class="spinner"></div>', "bot", true);

  let collector = [];
  for (let w of savedWallets) {
    await fetchPortfolio(w.address, w.nickname, collector);
  }

  chatMessages.removeChild(chatMessages.lastChild);

  if (collector.length === 0) {
    addMessage("No portfolio data found for any wallet.", "bot");
    return;
  }

  // Aggregate stats
  let totalValue = collector.reduce((sum, t) => sum + t.balanceUSD, 0);
  let ethVal = collector.filter(t => /ETH/i.test(t.symbol)).reduce((s, t) => s + t.balanceUSD, 0);
  let stableVal = collector.filter(t => /USDT|USDC|DAI/i.test(t.symbol)).reduce((s, t) => s + t.balanceUSD, 0);
  let altVal = totalValue - ethVal - stableVal;

  let text = `<strong>📊 Multi-Wallet Dashboard</strong><br>
              Total value: ~$${totalValue.toFixed(2)}<br>
              ETH: $${ethVal.toFixed(2)} (${((ethVal/totalValue)*100).toFixed(1)}%)<br>
              Stablecoins: $${stableVal.toFixed(2)} (${((stableVal/totalValue)*100).toFixed(1)}%)<br>
              Altcoins: $${altVal.toFixed(2)} (${((altVal/totalValue)*100).toFixed(1)}%)`;
  addMessage(text, "bot", true);

  // AI insights
  let insight = "💡 Portfolio Insight: ";
  if (stableVal/totalValue > 0.5) insight += "You are heavily in stablecoins → safe but low yield.";
  else if (ethVal/totalValue > 0.5) insight += "Most of your holdings are in ETH → strong but volatile.";
  else if (altVal/totalValue > 0.4) insight += "High altcoin exposure → risky but could be high reward.";
  else insight += "Balanced portfolio between ETH, stables, and altcoins.";
  addMessage(insight, "bot");
}

function handleUserInput() {
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, "user");
  input.value = "";

  if (text.toLowerCase().startsWith("add wallet")) {
    const parts = text.split(" ");
    if (parts.length < 3) {
      addMessage("Usage: add wallet <address> <nickname>", "bot");
      return;
    }
    const addr = parts[2];
    const nickname = parts[3] || `Wallet${savedWallets.length + 1}`;
    if (!isValidEthAddress(addr)) {
      addMessage("❌ Invalid Ethereum address.", "bot");
      return;
    }
    savedWallets.push({ address: addr, nickname });
    localStorage.setItem("wallets", JSON.stringify(savedWallets));
    addMessage(`✅ Wallet "${nickname}" added.`, "bot");
    return;
  }

  if (text.toLowerCase() === "list wallets") {
    if (savedWallets.length === 0) {
      addMessage("No wallets saved yet. Use: add wallet <address> <nickname>", "bot");
    } else {
      let list = "💼 Saved wallets:<br>";
      savedWallets.forEach(w => { list += `• ${w.nickname}: ${w.address}<br>`; });
      addMessage(list, "bot", true);
    }
    return;
  }

  if (text.toLowerCase().startsWith("check wallet")) {
    const nickname = text.replace("check wallet", "").trim();
    const wallet = savedWallets.find(w => w.nickname.toLowerCase() === nickname.toLowerCase());
    if (!wallet) {
      addMessage(`❌ No wallet found with nickname "${nickname}".`, "bot");
      return;
    }
    fetchPortfolio(wallet.address, wallet.nickname);
    return;
  }

  if (text.toLowerCase() === "dashboard") {
    buildDashboard();
    return;
  }

  if (!awaitingWallet) {
    addMessage("I can track wallets for you. Try: add wallet <address> <nickname>", "bot");
    awaitingWallet = true;
  } else {
    if (isValidEthAddress(text)) {
      addMessage("✅ Checking wallet...", "bot");
      fetchPortfolio(text, "Unnamed");
      awaitingWallet = false;
    } else {
      addMessage("❌ That doesn’t look like a valid Ethereum address. Try again.", "bot");
    }
  }
}

window.addEventListener("DOMContentLoaded", () => {
  addMessage("👋 Hi! I'm Analito, your Smart Portfolio Assistant. You can:", "bot");
  addMessage("• Add a wallet → `add wallet 0x123... MyWallet`<br>• List wallets → `list wallets`<br>• Check one → `check wallet MyWallet`<br>• Multi-wallet overview → `dashboard`", "bot", true);
});
