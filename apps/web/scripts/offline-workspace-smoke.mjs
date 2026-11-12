import assert from 'node:assert/strict';
import {offlineWorkspaceValid,saveOfflineWorkspace,readOfflineWorkspace,clearOfflineWorkspace} from '../src/lib/offline-workspace.ts';
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const now=Date.now();
const row={version:1,uid:'owner-a',portal:'owner',savedAt:now,organization:{organizationId:'shop-a',role:'OWNER',subscriptionStatus:'ACTIVE',endsAt:null},products:[],customers:[],policy:{allowStaffDiscount:false,staffDiscountLimit:0,defaultPayment:'CASH'}};
assert.equal(offlineWorkspaceValid(row,'owner-a','owner',now),true);
for(const bad of [null,{...row,uid:'other'},{...row,portal:'staff'},{...row,savedAt:now+1},{...row,savedAt:now-86400000},{...row,organization:{...row.organization,subscriptionStatus:'CANCELLED'}},{...row,organization:{...row.organization,endsAt:'invalid'}},{...row,organization:{...row.organization,endsAt:new Date(now).toISOString()}}])assert.equal(!!offlineWorkspaceValid(bad,'owner-a','owner',now),false);
saveOfflineWorkspace(row);assert.equal(readOfflineWorkspace('other','owner'),null);assert.equal(readOfflineWorkspace('owner-a','owner').organization.organizationId,'shop-a');clearOfflineWorkspace('owner-a');assert.equal(readOfflineWorkspace('owner-a','owner'),null);
console.log('Offline snapshot tests passed: account/role scope, expiry, invalid subscription, logout invalidation.');
