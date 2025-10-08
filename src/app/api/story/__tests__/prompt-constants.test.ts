import { ORCHESTRATOR_SYSTEM_PROMPT, CREATOR_SYSTEM_PROMPT, UPDATER_SYSTEM_PROMPT } from '../utils/prompt-constants';

describe('Story API - Prompt Constants', () => {
  describe('ORCHESTRATOR_SYSTEM_PROMPT', () => {
    it('should contain key instructions for the new architecture', () => {
      // Core Identity & Role
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('You are Weval Guide');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('translate it into actionable instructions');

      // Key Technical Tags
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<SYSTEM_STATUS>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<USER_MESSAGE>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<USER_RESPONSE>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('<SYSTEM_INSTRUCTIONS>');

      // Key Commands
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('CREATE_OUTLINE');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('UPDATE_OUTLINE');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('NO_OP');
      
      // Interaction Flow
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('1-2 user replies');
    });

    it('should NOT contain obsolete signals from the old architecture', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).not.toContain('<ready_to_begin/>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).not.toContain('<update_eval/>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).not.toContain('<BLUEPRINT_YAML>');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).not.toContain('Urgency Override');
    });

    it('should contain instructions for handling urgent/vague requests', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('URGENT/VAGUE REQUESTS');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain("do not ask clarifying questions");
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain("you must invent a specific, interesting area of concern");
    });
  });

  describe('CREATOR_SYSTEM_PROMPT', () => {
    it('should contain key instructions for the creator agent', () => {
      expect(CREATOR_SYSTEM_PROMPT).toContain('expert in AI evaluation');
      expect(CREATOR_SYSTEM_PROMPT).toContain('Create 1-3 self-contained prompts');
      expect(CREATOR_SYSTEM_PROMPT).toContain('plain language');
      expect(CREATOR_SYSTEM_PROMPT).toContain('<JSON>');
    });
  });

  describe('UPDATER_SYSTEM_PROMPT', () => {
    it('should contain key instructions for the updater agent', () => {
      expect(UPDATER_SYSTEM_PROMPT).toContain('expert Weval blueprint editor');
      expect(UPDATER_SYSTEM_PROMPT).toContain('Apply the change described in the \'guidance\'');
      expect(UPDATER_SYSTEM_PROMPT).toContain('Preserve all existing content');
      expect(UPDATER_SYSTEM_PROMPT).toContain('<JSON>');
    });
  });
});
