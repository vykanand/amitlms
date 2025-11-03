// Simple client for Test Series APIs with structured debug logging
(function(){
  const log = (...a)=>console.debug('[TestsApi]',...a);

  async function withSessionFetch(url, options={}){
    try{
      const resp = await addSessionToRequest(url, options);
      return resp;
    }catch(e){
      console.error('[TestsApi] fetch error', e);
      throw e;
    }
  }

  const TestsApi = {
    async getAllSeries(){
      log('getAllSeries: enter');
      const r = await withSessionFetch('/api/tests');
      const data = await r.json();
      log('getAllSeries: result count', Array.isArray(data)?data.length:0);
      return data||[];
    },
    async getSeriesById(id){
      log('getSeriesById: enter', {id});
      const r = await withSessionFetch(`/api/tests/${id}`);
      const data = await r.json();
      log('getSeriesById: loaded', {id});
      return data;
    },
    async createSeries(payload){
      log('createSeries: enter', payload);
      const r = await withSessionFetch('/api/tests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await r.json();
      log('createSeries: created', data);
      return data;
    },
    async updateSeries(id, payload){
      log('updateSeries: enter', {id});
      const r = await withSessionFetch(`/api/tests/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      const data = await r.json();
      log('updateSeries: updated', {id});
      return data;
    },
    async deleteSeries(id){
      log('deleteSeries: enter', {id});
      const r = await withSessionFetch(`/api/tests/${id}`, { method:'DELETE' });
      const data = await r.json();
      log('deleteSeries: deleted', {id});
      return data;
    }
  };

  // expose globally
  window.TestsApi = TestsApi;
})();