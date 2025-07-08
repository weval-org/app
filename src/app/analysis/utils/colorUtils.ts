export const getGradedCoverageColor = (isPresent: boolean, extent?: number): string => {
    // These now return Tailwind CSS background color class names
    const UNMET_CLASS = 'bg-coverage-unmet';
    const FULLY_MET_CLASS = 'bg-coverage-fully-met';
    const NO_EXTENT_DATA_PRESENT_CLASS = 'bg-coverage-no-extent';

    if (extent === undefined || extent === null || isNaN(extent)) {
        return isPresent ? NO_EXTENT_DATA_PRESENT_CLASS : UNMET_CLASS;
    }

    if (!isPresent) {
        return UNMET_CLASS;
    }

    if (extent === 1.0) {
        return FULLY_MET_CLASS;
    }

    const clampedExtent = Math.max(0, Math.min(extent, 0.999));
    const grade = Math.floor(clampedExtent * 10); // 0-9

    const gradeClasses = [
        'bg-coverage-grade-0',   // Grade 0 (0.0-0.09)
        'bg-coverage-grade-1',   // Grade 1 (0.1-0.19)
        'bg-coverage-grade-2',   // Grade 2 (0.2-0.29)
        'bg-coverage-grade-3',   // Grade 3 (0.3-0.39)
        'bg-coverage-grade-4',   // Grade 4 (0.4-0.49)
        'bg-coverage-grade-5',   // Grade 5 (0.5-0.59)
        'bg-coverage-grade-6',   // Grade 6 (0.6-0.69)
        'bg-coverage-grade-7',   // Grade 7 (0.7-0.79)
        'bg-coverage-grade-8',   // Grade 8 (0.8-0.89)
        'bg-coverage-grade-9',   // Grade 9 (0.9-0.99)
    ];

    if (grade >= 0 && grade < gradeClasses.length) {
        return gradeClasses[grade];
    }
    return NO_EXTENT_DATA_PRESENT_CLASS; // Fallback
}; 