const { getPacedSendOffsets } = require('../scripts/performanceLoadSchedule');

describe('performance load pacing', () => {
  it('spaces 100 connected clients evenly across a five-second interval', () => {
    const offsets = getPacedSendOffsets(100, 5000);

    expect(offsets).toHaveLength(100);
    expect(offsets[0]).toBe(0);
    expect(offsets[99]).toBe(4950);
    expect(offsets.slice(0, 5)).toEqual([0, 50, 100, 150, 200]);
    expect(new Set(offsets).size).toBe(100);
  });

  it('keeps one send per client and works with a shorter smoke interval', () => {
    expect(getPacedSendOffsets(4, 1000)).toEqual([0, 250, 500, 750]);
    expect(getPacedSendOffsets(1, 5000)).toEqual([0]);
  });

  it('rejects invalid schedule dimensions', () => {
    expect(() => getPacedSendOffsets(0, 5000)).toThrow(TypeError);
    expect(() => getPacedSendOffsets(2, 0)).toThrow(TypeError);
  });
});
