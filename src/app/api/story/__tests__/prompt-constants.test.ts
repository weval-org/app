import { ORCHESTRATOR_SYSTEM_PROMPT, CREATOR_SYSTEM_PROMPT, UPDATER_SYSTEM_PROMPT } from '../utils/prompt-constants';

describe('Story API - Prompt Constants', () => {
  describe('ORCHESTRATOR_SYSTEM_PROMPT', () => {
    it('should contain key orchestrator instructions', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('Weval Guide');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<ready_to_begin/>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<cta>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<BLUEPRINT_YAML>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<update_eval/>');
    });

    it('should include urgency override instructions', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('Urgency Override');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('immediately create');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('skip clarifying questions');
    });

    it('should specify two-turn maximum for normal flow', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('at most two user turns');
    });
  });

  describe('CREATOR_SYSTEM_PROMPT', () => {
    it('should contain creator-specific instructions', () => {
      expect(CREATOR_SYSTEM_PROMPT).toContain('expert in AI evaluation');
      expect(CREATOR_SYSTEM_PROMPT).toContain('Weval blueprint format');
      expect(CREATOR_SYSTEM_PROMPT).toContain('self-contained');
      expect(CREATOR_SYSTEM_PROMPT).toContain('<JSON>');
    });

    it('should limit to 1-5 prompts', () => {
      expect(CREATOR_SYSTEM_PROMPT).toContain('1–5 prompts maximum');
    });

    it('should emphasize plain language', () => {
      expect(CREATOR_SYSTEM_PROMPT).toContain('plain language');
      expect(CREATOR_SYSTEM_PROMPT).toContain('users can understand');
    });
  });

  describe('UPDATER_SYSTEM_PROMPT', () => {
    it('should contain updater-specific instructions', () => {
      expect(UPDATER_SYSTEM_PROMPT).toContain('blueprint editor');
      expect(UPDATER_SYSTEM_PROMPT).toContain('<CURRENT_JSON>');
      expect(UPDATER_SYSTEM_PROMPT).toContain('<GUIDANCE>');
      expect(UPDATER_SYSTEM_PROMPT).toContain('Preserve existing content');
    });

    it('should emphasize targeted modifications', () => {
      expect(UPDATER_SYSTEM_PROMPT).toContain('targeted modifications');
      expect(UPDATER_SYSTEM_PROMPT).toContain('unless guidance clearly asks');
    });
  });
});
