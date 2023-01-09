/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PerformanceEvent, PerformanceEvents, StaticFields } from "./PerformanceEvent";
import { IPerformanceMeasurement } from "./IPerformanceMeasurement";

export type PerformanceCallbackFunction = (events: PerformanceEvent[]) => void;

export type InProgressPerformanceEvent = {
    endMeasurement: (event?: Partial<PerformanceEvent>) => PerformanceEvent | null
    flushMeasurement: () => void,
    discardMeasurement: () => void,
    addStaticFields: (staticFields: StaticFields) => void,
    event: PerformanceEvent,
    measurement: IPerformanceMeasurement
};

export interface IPerformanceClient {
    startMeasurement(measureName: PerformanceEvents, correlationId?: string): InProgressPerformanceEvent;
    endMeasurement(event: PerformanceEvent): PerformanceEvent | null;
    flushMeasurements(measureName: PerformanceEvents, correlationId?: string): void;
    discardMeasurements(correlationId: string): void;
    addStaticFields(staticFields: StaticFields, correlationId: string): void;
    removePerformanceCallback(callbackId: string): boolean;
    addPerformanceCallback(callback: PerformanceCallbackFunction): string;
    emitEvents(events: PerformanceEvent[], correlationId: string): void;
    startPerformanceMeasurement(measureName: string, correlationId: string): IPerformanceMeasurement;
    generateId(): string;
    calculateQueuedTime(preQueueTime: number, currentTime: number): number;
    addQueueMeasurement(queueMeasurement?: QueueMeasurement | null): void;
}

/**
 * Queue measurement type
 */
export type QueueMeasurement = {
    /**
     * Name of performance event
     */
    eventName: PerformanceEvents,

    /**
     * CorrelationId
     */
    correlationId: string,

    /**
     * Time before performance event queued
     */
    preQueueTime?: number,

    /**
     * Time spent in JS queue
     */
    queueTime?: number
};
