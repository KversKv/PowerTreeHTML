/* parts-lib.data.js — 器件库 */
PT.registerData("parts-lib", {
  "BES1811_BUCK1": {
    "vendor": "BES",
    "vin_range": [2.7, 5.5],
    "vout_range": [0.5, 1.3],
    "imax": 6000,
    "iq_ua": 25,
    "eff_ref": "BES1811_BUCK1",
    "theta_ja": 45
  },
  "BES1811_LDO1": {
    "vendor": "BES",
    "vin_range": [1.5, 5.5],
    "vout_range": [0.3, 1.9],
    "imax": 500,
    "dropout_mv": 150,
    "iq_ua": 12
  },
  "TPS62840_BUCK": {
    "vendor": "TI",
    "vin_range": [1.8, 6.5],
    "vout_range": [0.6, 4.0],
    "imax": 750,
    "iq_ua": 0.06,
    "eff_ref": "TPS62840_BUCK"
  },
  "AP63200_BUCK": {
    "vendor": "Diodes",
    "vin_range": [3.8, 32],
    "vout_range": [0.8, 24],
    "imax": 2000,
    "iq_ua": 22
  },
  "TPS7A02_LDO": {
    "vendor": "TI",
    "vin_range": [1.4, 6.0],
    "vout_range": [0.8, 5.0],
    "imax": 200,
    "dropout_mv": 130,
    "iq_ua": 0.025
  },
  "TPS22946_LSW": {
    "vendor": "TI",
    "vin_range": [1.62, 5.5],
    "imax": 70,
    "rds_on_mohm": 320
  },
  "LM5050_ORING": {
    "vendor": "TI",
    "vin_range": [1, 75],
    "imax": 5000,
    "vf_mv": 22
  }
});
