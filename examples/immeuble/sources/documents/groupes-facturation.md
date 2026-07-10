# Registre fictif des groupes de facturation

Registre tenu par le syndic pour les appels de charges des ACP Les Tilleuls et Les Erables.

Chaque lot possede un **groupe de facturation** unique. Le syndic emet les appels de charges vers ce groupe ; la relation **`bills_to`** lie le groupe au lot concerne et indique qui recoit la facture (coproprietaires, bailleur, mandataire, etc.).

## Residence Les Tilleuls

| Lot                     | Groupe facturation                      | Destinataire appels             | Mode repartition | Relation          |
| ----------------------- | --------------------------------------- | ------------------------------- | ---------------- | ----------------- |
| Tilleuls Appartement A1 | Groupe facturation Tilleuls A1          | Henri Dupont ; Madeleine Dupont | 50% / 50%        | bills_to → lot A1 |
| Tilleuls Appartement A2 | Groupe facturation Tilleuls A2          | Sofia Martin                    | 100%             | bills_to → lot A2 |
| Tilleuls Appartement A3 | Groupe facturation Tilleuls A3          | Nicolas Dupont ; Pauline Dupont | 50% / 50%        | bills_to → lot A3 |
| Tilleuls Appartement A4 | Groupe facturation Tilleuls A4 bailleur | Immo Invest SRL (bailleur)      | bailleur         | bills_to → lot A4 |
| Tilleuls Appartement A5 | Groupe facturation Tilleuls A5          | Lena Peeters ; Noah De Smet     | 50% / 50%        | bills_to → lot A5 |

## Residence Les Erables

| Lot                    | Groupe facturation                       | Destinataire appels                                      | Mode repartition         | Relation          |
| ---------------------- | ---------------------------------------- | -------------------------------------------------------- | ------------------------ | ----------------- |
| Erables Appartement A1 | Groupe facturation Erables A1            | Alice Bernard                                            | 100%                     | bills_to → lot A1 |
| Erables Appartement A2 | Groupe facturation Erables A2 bailleur   | Patrimoine Nord SRL (bailleur)                           | bailleur                 | bills_to → lot A2 |
| Erables Appartement A3 | Groupe facturation Erables A3            | Victor Moreau                                            | 100%                     | bills_to → lot A3 |
| Erables Appartement A4 | Groupe facturation Erables A4 travaux    | Claire Dubois (travaux en cours)                         | travaux                  | bills_to → lot A4 |
| Erables Appartement B1 | Groupe facturation Erables B1 succession | Olivier Renard (usufruit) ; Julie Renard (nue-propriete) | usufruit / nue-propriete | bills_to → lot B1 |
| Erables Appartement B2 | Groupe facturation Erables B2 bailleur   | Immo Invest SRL (bailleur)                               | bailleur                 | bills_to → lot B2 |
| Erables Appartement B3 | Groupe facturation Erables B3 bailleur   | Patrimoine Nord SRL (bailleur)                           | bailleur                 | bills_to → lot B3 |
| Erables Appartement B4 | Groupe facturation Erables B4 mandataire | Marta Rossi (mandataire pour proprietaire a l'etranger)  | mandataire               | bills_to → lot B4 |

Note syndic : les appels mensuels CODA et les quittances automatiques referent au groupe de facturation du lot concerne.
