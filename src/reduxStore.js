import { combineReducers, configureStore } from '@reduxjs/toolkit'
import playerControlsSlice from 'resoundModules/playerControls/stateSlice'

const reducer = combineReducers({ playerControls: playerControlsSlice })

const store = configureStore({
  reducer,
})

export default store
