Voici le bilan court.

**Ce qui a bien été patché**
La V1 interne est bien alignée sur le plan réduit :
- artefacts V1 ajoutés : [`CAPABILITIES.md`](/Users/francois/Documents/mars2026/ghostcrab-mcp/ghostcrab-skill/CAPABILITIES.md), [`SERVER_INSTRUCTIONS.md`](/Users/francois/Documents/mars2026/ghostcrab-mcp/ghostcrab-skill/SERVER_INSTRUCTIONS.md), [`MCP_TOOL_DESCRIPTION_PATCHES.md`](/Users/francois/Documents/mars2026/ghostcrab-mcp/ghostcrab-skill/MCP_TOOL_DESCRIPTION_PATCHES.md), [`shared/TRANSITION_LOGGING.md`](/Users/francois/Documents/mars2026/ghostcrab-mcp/ghostcrab-skill/shared/TRANSITION_LOGGING.md)
- rails Claude/OpenClaw renforcés avec persona rule, hard gate, prompt-help, checkpoint, transition rationale
- miroir Codex ajouté dans [`codex/`]( /Users/francois/Documents/mars2026/ghostcrab-mcp/ghostcrab-skill/codex )
- scénarios OpenClaw naturalisés, avec cas hors-domaine
- validation interne OK : `npm run validate:strict` passe dans [`ghostcrab-skill`](/Users/francois/Documents/mars2026/ghostcrab-mcp/ghostcrab-skill)

**Ce qui échoue encore en runtime Claude Code**
En pratique, Sonnet 4.6 continue à ignorer le contrat V1 sur les premiers tours flous :
- `ghostcrab_status` et `ghostcrab_schema_list` sont encore appelés trop tôt
- réponses encore `read-first` et `schema-first`
- pas de format fermé respecté
- sur `crm-pipeline`, Claude saute directement à la structure et à l’alimentation au lieu de faire l’intake
- donc les rails texte sont présents, mais ne sont pas traités comme des contraintes dures en exécution

**Implication pour la beta**
La V1 est prête côté artefacts et cohérence documentaire, mais pas encore sûre pour une beta publique “Claude Code / Sonnet 4.6” sans garde-fou supplémentaire.
Concrètement :
- `Codex`, `OpenClaw` et probablement `Opus 4.6` restent testables
- `Claude Code + Sonnet 4.6` doit être considéré comme surface à risque
- pour la beta, il faut soit un wrapper/host guard plus dur, soit limiter officiellement cette surface, soit documenter qu’elle est expérimentale et non conforme au contrat d’onboarding V1

Si tu veux, je peux te le sauver en note courte dans `docs/`.