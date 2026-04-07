import { describe, it, expect, beforeEach } from 'vitest';
import { useHotStore } from './hot.store';
import { TIMEFRAME, hotInitialState } from './hot.types';
import { REACH } from '../home/home.types';

describe('HotStore', () => {
  beforeEach(() => {
    // Reset the store to initial state before each test
    useHotStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should initialize with default filter values', () => {
      const state = useHotStore.getState();

      expect(state.reach).toBe(REACH.ALL);
      expect(state.timeframe).toBe(TIMEFRAME.THIS_MONTH);
    });

    it('should match hotInitialState', () => {
      const state = useHotStore.getState();

      expect(state.reach).toBe(hotInitialState.reach);
      expect(state.timeframe).toBe(hotInitialState.timeframe);
    });
  });

  describe('Reach Management', () => {
    it('should set reach to all', () => {
      const store = useHotStore.getState();

      store.setReach(REACH.ALL);
      expect(useHotStore.getState().reach).toBe(REACH.ALL);
    });

    it('should set reach to following', () => {
      const store = useHotStore.getState();

      store.setReach(REACH.FOLLOWING);
      expect(useHotStore.getState().reach).toBe(REACH.FOLLOWING);
    });

    it('should set reach to friends', () => {
      const store = useHotStore.getState();

      store.setReach(REACH.FRIENDS);
      expect(useHotStore.getState().reach).toBe(REACH.FRIENDS);
    });

    it('should persist reach changes', () => {
      const store = useHotStore.getState();

      store.setReach(REACH.FOLLOWING);
      expect(useHotStore.getState().reach).toBe(REACH.FOLLOWING);

      store.setReach(REACH.FRIENDS);
      expect(useHotStore.getState().reach).toBe(REACH.FRIENDS);
    });
  });

  describe('Timeframe Management', () => {
    it('should set timeframe to today', () => {
      const store = useHotStore.getState();

      store.setTimeframe(TIMEFRAME.TODAY);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.TODAY);
    });

    it('should set timeframe to this week', () => {
      const store = useHotStore.getState();

      store.setTimeframe(TIMEFRAME.THIS_WEEK);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.THIS_WEEK);
    });

    it('should set timeframe to this month', () => {
      const store = useHotStore.getState();

      store.setTimeframe(TIMEFRAME.THIS_MONTH);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.THIS_MONTH);
    });

    it('should set timeframe to all time', () => {
      const store = useHotStore.getState();

      store.setTimeframe(TIMEFRAME.ALL_TIME);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.ALL_TIME);
    });

    it('should persist timeframe changes', () => {
      const store = useHotStore.getState();

      store.setTimeframe(TIMEFRAME.THIS_MONTH);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.THIS_MONTH);

      store.setTimeframe(TIMEFRAME.ALL_TIME);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.ALL_TIME);
    });
  });

  describe('Reset', () => {
    it('should reset all filters to initial state', () => {
      const store = useHotStore.getState();

      // Modify state
      store.setReach(REACH.FOLLOWING);
      store.setTimeframe(TIMEFRAME.ALL_TIME);

      // Verify modifications
      expect(useHotStore.getState().reach).toBe(REACH.FOLLOWING);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.ALL_TIME);

      // Reset
      store.reset();

      // Verify reset
      const state = useHotStore.getState();
      expect(state.reach).toBe(hotInitialState.reach);
      expect(state.timeframe).toBe(hotInitialState.timeframe);
    });
  });

  describe('Combined State Changes', () => {
    it('should handle multiple filter changes correctly', () => {
      const store = useHotStore.getState();

      store.setReach(REACH.FRIENDS);
      store.setTimeframe(TIMEFRAME.THIS_MONTH);

      const state = useHotStore.getState();
      expect(state.reach).toBe(REACH.FRIENDS);
      expect(state.timeframe).toBe(TIMEFRAME.THIS_MONTH);
    });

    it('should maintain independent filter states', () => {
      const store = useHotStore.getState();

      // Set reach
      store.setReach(REACH.FOLLOWING);
      const initialTimeframe = useHotStore.getState().timeframe;

      // Verify reach changed but timeframe unchanged
      expect(useHotStore.getState().reach).toBe(REACH.FOLLOWING);
      expect(useHotStore.getState().timeframe).toBe(initialTimeframe);

      // Set timeframe
      store.setTimeframe(TIMEFRAME.ALL_TIME);

      // Verify timeframe changed but reach unchanged
      expect(useHotStore.getState().reach).toBe(REACH.FOLLOWING);
      expect(useHotStore.getState().timeframe).toBe(TIMEFRAME.ALL_TIME);
    });
  });
});
