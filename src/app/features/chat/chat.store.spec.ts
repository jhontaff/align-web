import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SessionService } from '../../core/auth/session.service';
import { DataRefreshService } from '../../core/data/data-refresh.service';
import { ChatStore } from './chat.store';
import { PendingActionResponse } from './models/pending-action.model';

const ACTION_A: PendingActionResponse = {
  id: 'a1',
  toolName: 'delete_task',
  arguments: { title: 'Comprar leche' },
  createdAt: '2026-09-12T10:00:00'
};

const ACTION_B: PendingActionResponse = {
  id: 'a2',
  toolName: 'delete_transaction',
  arguments: { title: 'Cena' },
  createdAt: '2026-09-12T10:05:00'
};

describe('ChatStore — pending actions', () => {
  let store: ChatStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    store = TestBed.inject(ChatStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loadHistory() pide también las acciones pendientes y llena el signal', () => {
    store.loadHistory();

    http.expectOne('/api/agent/history').flush({ turns: [] });
    http.expectOne('/api/agent/pending-actions').flush([ACTION_A]);

    expect(store.pendingActions()).toEqual([ACTION_A]);
  });

  it('confirmAction() quita la acción de inmediato e invalida datos al confirmar', () => {
    store.loadHistory();
    http.expectOne('/api/agent/history').flush({ turns: [] });
    http.expectOne('/api/agent/pending-actions').flush([ACTION_A, ACTION_B]);

    const dataRefresh = TestBed.inject(DataRefreshService);
    const invalidate = spyOn(dataRefresh, 'invalidate');

    store.confirmAction(ACTION_A.id);

    // Optimista: ya no está antes de que responda el backend.
    expect(store.pendingActions()).toEqual([ACTION_B]);

    http.expectOne('/api/agent/pending-actions/a1/confirm').flush({});
    expect(invalidate).toHaveBeenCalled();
  });

  it('rejectAction() quita la acción y NO invalida datos', () => {
    store.loadHistory();
    http.expectOne('/api/agent/history').flush({ turns: [] });
    http.expectOne('/api/agent/pending-actions').flush([ACTION_A]);

    const dataRefresh = TestBed.inject(DataRefreshService);
    const invalidate = spyOn(dataRefresh, 'invalidate');

    store.rejectAction(ACTION_A.id);

    expect(store.pendingActions()).toEqual([]);

    http.expectOne('/api/agent/pending-actions/a1/reject').flush(null);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('un error al confirmar aparece como mensaje del agente en el hilo', () => {
    store.loadHistory();
    http.expectOne('/api/agent/history').flush({ turns: [] });
    http.expectOne('/api/agent/pending-actions').flush([ACTION_A]);

    store.confirmAction(ACTION_A.id);

    http.expectOne('/api/agent/pending-actions/a1/confirm').flush(
      { message: 'La tarea ya no existe.' },
      { status: 404, statusText: 'Not Found' }
    );

    const last = store.messages().at(-1);
    expect(last?.role).toBe('assistant');
    expect(last?.text).toBe('La tarea ya no existe.');
  });

  it('send() vuelve a pedir las acciones pendientes tras la respuesta del agente', () => {
    store.loadHistory();
    http.expectOne('/api/agent/history').flush({ turns: [] });
    http.expectOne('/api/agent/pending-actions').flush([]);

    store.send('elimina la tarea de comprar leche');

    http.expectOne('/api/agent/chat').flush({ reply: 'Hecho, queda pendiente de tu confirmación.' });
    http.expectOne('/api/agent/pending-actions').flush([ACTION_A]);

    expect(store.pendingActions()).toEqual([ACTION_A]);
  });
});

describe('ChatStore — reset al cerrar sesión', () => {
  let store: ChatStore;
  let session: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    store = TestBed.inject(ChatStore);
    session = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('limpia mensajes y acciones pendientes al terminar la sesión, y deja cargar el historial del siguiente usuario', () => {
    store.loadHistory();
    http.expectOne('/api/agent/history').flush({ turns: [{ role: 'user', content: 'hola' }] });
    http.expectOne('/api/agent/pending-actions').flush([ACTION_A]);

    expect(store.messages().length).toBe(1);
    expect(store.pendingActions()).toEqual([ACTION_A]);

    session.clear();

    expect(store.messages()).toEqual([]);
    expect(store.pendingActions()).toEqual([]);

    // loadedOnce volvió a false: el usuario nuevo dispara su propia carga.
    store.loadHistory();
    http.expectOne('/api/agent/history').flush({ turns: [] });
    http.expectOne('/api/agent/pending-actions').flush([]);
  });

  it('descarta una respuesta de historial que llega después de que la sesión ya terminó', () => {
    store.loadHistory();
    const historyReq = http.expectOne('/api/agent/history');
    http.expectOne('/api/agent/pending-actions').flush([]);

    session.clear();
    historyReq.flush({ turns: [{ role: 'user', content: 'mensaje del usuario anterior' }] });

    expect(store.messages()).toEqual([]);
  });
});
