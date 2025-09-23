import { BasicScene } from './basic-scene';

describe('BasicScene', () => {
  it('should create an instance', () => {
    // Create a mock canvas element
    const canvas = document.createElement('canvas');
    expect(new BasicScene(canvas)).toBeTruthy();
  });
});
