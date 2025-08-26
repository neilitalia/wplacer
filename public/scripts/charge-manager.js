class ChargeManager {
  constructor() {
    this.chargeTimers = new Map();
    this.charges = new Map();
    this.CHARGE_INTERVAL = 30000; // 30 seconds
  }

  addUser(userId, initialCharges = 0) {
    // Stop existing timer if any
    this.stopChargeTimer(userId);

    // Store initial charges
    this.charges.set(userId, initialCharges);

    const userElement = document.querySelector(`#user-${userId}`);
    if (!userElement) return;

    const chargesElement = userElement.querySelector('.charges-count');
    if (!chargesElement) return;

    // Set initial charges display
    chargesElement.textContent = initialCharges;

    // Start new timer
    this.chargeTimers.set(userId, setInterval(() => {
      const currentCharges = this.charges.get(userId) + 1;
      this.charges.set(userId, currentCharges);

      chargesElement.textContent = currentCharges;

      // Add animation effect
      chargesElement.classList.add('charge-increment');
      setTimeout(() => chargesElement.classList.remove('charge-increment'), 500);
    }, this.CHARGE_INTERVAL));

    console.log(`Started charge timer for user ${userId}`);
  }

  removeUser(userId) {
    this.stopChargeTimer(userId);
    this.charges.delete(userId);
    console.log(`Removed charge timer for user ${userId}`);
  }

  stopChargeTimer(userId) {
    if (this.chargeTimers.has(userId)) {
      clearInterval(this.chargeTimers.get(userId));
      this.chargeTimers.delete(userId);
    }
  }

  getCharges(userId) {
    return this.charges.get(userId) || 0;
  }

  cleanup() {
    this.chargeTimers.forEach((_, userId) => this.removeUser(userId));
  }
}