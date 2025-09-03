class ChargeManager {
  constructor() {
    this.chargeTimers = new Map();
    this.charges = new Map();
    this.CHARGE_INTERVAL = 30000; // 30 seconds
  }

  addUser(userElement, initialCharges = 0, maxCharges = 0) {
    // Stop existing timer if any
    const userId = userElement.id.replace('user-', '');
    this.stopChargeTimer(userId);

    // Store initial charge data
    this.charges.set(userId, { initialCharges, maxCharges });
    if (maxCharges === 0) return; // No charges to manage

    try {
      if (!userElement) throw new Error("User element not found");

      const currentChargesElement = userElement.querySelector('.current-charges');
      if (!currentChargesElement) throw new Error("Current charges element not found");

      const maxChargesElement = userElement.querySelector('.max-charges');
      if (!maxChargesElement) throw new Error("Max charges element not found");

      // Set initial charges display
      currentChargesElement.innerText = initialCharges;

      // Start new timer
      this.chargeTimers.set(userId, setInterval(() => {
        const charges = this.charges.get(userId);
        const currentCharges = Math.min(charges.initialCharges, charges.maxCharges);
        const maxCharges = charges.maxCharges;

        if (currentCharges < maxCharges) {
          this.charges.set(userId, { initialCharges: currentCharges + 1, maxCharges });
          currentChargesElement.innerText = currentCharges;

          // Add animation effect
          userElement.classList.add('charge-increment');
          setTimeout(() => userElement.classList.remove('charge-increment'), 1000);
        }
      }, this.CHARGE_INTERVAL));

      console.log(`Started charge timer for user ${userId}`);
    } catch (error) {
      console.error(`Failed to add user ${userId} to ChargeManager:`, error);
    }
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